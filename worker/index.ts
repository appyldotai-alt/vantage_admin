import { accessEmail, type AccessEnv } from './access';
import * as db from './db';
import * as fixtures from './fixtures';
import type { Backend } from '../src/types';

// API for admin.appyl.ai (prod) and dev.admin.appyl.ai (dev). Static files (the app) are served by Workers
// assets; only /api/* reaches this code (wrangler.jsonc run_worker_first). Each deployment reads only its
// own database (binding DB) and names itself with BACKEND.

interface Env extends AccessEnv {
  BACKEND: Backend;
  DB: Hyperdrive;
  MAILBOXES: KVNamespace;
  EMAIL: SendEmail;
  /** Local `vite dev` only: serve worker/fixtures.ts instead of the database. */
  DEV_FIXTURES?: string;
}

/** Same as the mail Worker's SENT_MAP_TTL_SECONDS: how long delivery events can still be routed. */
const SENT_MAP_TTL_SECONDS = 60 * 60 * 24 * 45;
const MAX_REPLY_CHARS = 10_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

const isLocal = (url: URL) => url.hostname === 'localhost' || url.hostname === '127.0.0.1';

async function route(request: Request, env: Env, sql: db.Sql, path: string, who: string): Promise<Response> {
  const thread = /^threads\/([^/]+)(?:\/(reply|done))?$/.exec(path);
  const id = thread?.[1];
  if (thread && !UUID.test(id!)) return json({ error: 'not found' }, 404);

  if (request.method === 'GET') {
    if (path === 'health') return json(await db.health(sql));
    if (path === 'delivery') return json(await db.delivery(sql));
    if (path === 'mailboxes') return json(await db.mailboxes(sql));
    if (path === 'platform') return json(await db.platform(sql));
    if (path === 'users') return json(await db.platformUsers(sql));
    if (path === 'threads') return json(await db.teamThreads(sql));
    if (thread && !thread[2]) {
      const detail = await db.teamThread(sql, id!);
      return detail ? json(detail) : json({ error: 'not found' }, 404);
    }
  }

  if (request.method === 'POST' && thread?.[2] === 'done') {
    const body = (await request.json().catch(() => null)) as { done?: unknown } | null;
    if (typeof body?.done !== 'boolean') return json({ error: 'done must be true or false' }, 400);
    const row = await db.setDone(sql, id!, body.done);
    return row ? json(row) : json({ error: 'not found' }, 404);
  }

  if (request.method === 'POST' && thread?.[2] === 'reply') {
    const body = (await request.json().catch(() => null)) as { text?: unknown } | null;
    const text = typeof body?.text === 'string' ? body.text.trim() : '';
    if (!text || text.length > MAX_REPLY_CHARS) return json({ error: 'Write a reply first (10,000 characters at most).' }, 400);
    const target = await db.replyTarget(sql, id!);
    if (!target) return json({ error: 'not found' }, 404);

    const { messageId } = await env.EMAIL.send({
      from: { email: target.mailboxAddress, name: 'Appyl' },
      to: [target.to],
      subject: target.subject,
      text,
      headers: {
        ...(target.inReplyTo ? { 'In-Reply-To': target.inReplyTo } : {}),
        ...(target.references.length ? { References: target.references.join(' ') } : {}),
      },
    });
    // Delivery events for this reply go to the backend whose database holds it.
    await env.MAILBOXES.put(`sent:${messageId}`, env.BACKEND, { expirationTtl: SENT_MAP_TTL_SECONDS });
    await db.recordReply(sql, target, messageId, text, who);
    console.log(JSON.stringify({ event: 'team_reply', backend: env.BACKEND, from: target.mailboxAddress, by: who, messageId }));
    return json({ messageId });
  }

  return json({ error: 'not found' }, 404);
}

/** Local sample data (DEV_FIXTURES=1 on localhost): same routes, no database, nothing is sent. */
function fixtureRoute(request: Request, path: string): Response {
  const thread = /^threads\/([^/]+)(?:\/(reply|done))?$/.exec(path);
  if (request.method === 'POST') return json(thread?.[2] === 'done' ? fixtures.threads.find((t) => t.id === thread[1]) : { messageId: '<fixture@localhost>' });
  if (path === 'health') return json(fixtures.health);
  if (path === 'delivery') return json(fixtures.delivery);
  if (path === 'mailboxes') return json(fixtures.mailboxes);
  if (path === 'threads') return json(fixtures.threads);
  const detail = thread ? fixtures.thread(thread[1]!) : null;
  return detail ? json(detail) : json({ error: 'not found' }, 404);
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    const who = await accessEmail(request, env);
    if (!who) return json({ error: 'unauthorized' }, 401);
    if (url.pathname === '/api/me') return json({ email: who, backend: env.BACKEND });

    // Writes only from this site's own pages (Access cookies ride along on cross-site requests too).
    if (request.method !== 'GET' && request.headers.get('origin') !== url.origin) return json({ error: 'forbidden' }, 403);

    const path = url.pathname.replace(/^\/api\//, '');
    if (env.DEV_FIXTURES === '1' && isLocal(url)) return fixtureRoute(request, path);

    const sql = db.connect(env.DB.connectionString);
    try {
      return await route(request, env, sql, path, who);
    } catch (err) {
      const e = err as Error & { code?: string };
      console.log(JSON.stringify({ event: 'api_error', backend: env.BACKEND, path, code: e.code, error: e.message }));
      const message = e.code?.startsWith('E_')
        ? `Sending failed (${e.code}). Nothing was sent; try again.`
        : `Could not load ${env.BACKEND === 'prod' ? 'production' : 'dev'} data. Check the database connection.`;
      return json({ error: message }, 500);
    } finally {
      ctx.waitUntil(sql.end());
    }
  },
} satisfies ExportedHandler<Env>;
