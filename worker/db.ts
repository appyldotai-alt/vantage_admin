import postgres from 'postgres';
import { STAGES, type AppylMail, type Delivery, type Health, type MailboxRow, type Platform, type PlatformUser, type Stage, type TeamMessage, type TeamThread, type TeamThreadDetail, type UserMail } from '../src/types';

// Reads (and, for team mail, writes) this deployment's Postgres through Hyperdrive. Tables live in schema
// `api` and are owned by vantage_express (packages/database/src/schema/mail.ts); keep the column names
// here in step with it. Columns come back camelCase (postgres.camel).

export type Sql = postgres.Sql;

export function connect(connectionString: string): Sql {
  return postgres(connectionString, { max: 5, fetch_types: false, transform: postgres.camel });
}

const PROBLEM_TYPES = ['deferred', 'bounced', 'failed', 'rejected', 'complained'];

async function userMail(sql: Sql): Promise<UserMail> {
  const [row] = await sql<UserMail[]>`
    select
      count(*) filter (where m.sent_at is not null)::int as sent,
      count(*) filter (where m.delivered_at is not null)::int as delivered,
      count(*) filter (where m.status = 'bounced')::int as bounced,
      count(*) filter (where m.status = 'complained')::int as complaints,
      (select count(*)::int from api.mail_events e join api.mail_messages mm on mm.id = e.message_id join api.mailboxes bb on bb.id = mm.mailbox_id
        where not bb.team and e.type = 'deferred' and e.occurred_at >= now() - interval '30 days') as delayed
    from api.mail_messages m join api.mailboxes b on b.id = m.mailbox_id
    where not b.team and m.direction = 'outbound' and m.created_at >= now() - interval '30 days'`;
  return row!;
}

async function appylMail(sql: Sql): Promise<AppylMail> {
  const rows = await sql<Array<{ type: string; n: number }>>`
    select type, count(*)::int as n from api.mail_events
    where message_id is null and occurred_at >= now() - interval '30 days'
    group by type`;
  const n = (t: string) => rows.find((r) => r.type === t)?.n ?? 0;
  const failed = n('failed') + n('rejected');
  return { settled: n('delivered') + n('bounced') + failed, delivered: n('delivered'), bounced: n('bounced'), failed, complaints: n('complained'), delayed: n('deferred') };
}

export async function health(sql: Sql): Promise<Health> {
  const [users, appyl, [needs]] = await Promise.all([
    userMail(sql),
    appylMail(sql),
    sql<Array<{ n: number }>>`
      select count(*)::int as n from api.mail_threads t join api.mailboxes b on b.id = t.mailbox_id
      where b.team and t.last_direction = 'inbound' and t.team_done_at is null`,
  ]);
  return { users, appyl, needsReply: needs!.n, asOf: new Date().toISOString() };
}

export async function delivery(sql: Sql): Promise<Delivery> {
  const [h, days, problems] = await Promise.all([
    health(sql),
    sql<Delivery['days']>`
      select to_char(date_trunc('day', occurred_at), 'YYYY-MM-DD') as day, (message_id is null) as appyl,
        count(*) filter (where type = 'delivered')::int as delivered,
        count(*) filter (where type in ('bounced', 'failed', 'rejected'))::int as bad
      from api.mail_events
      where occurred_at >= now() - interval '30 days'
      group by 1, 2
      order by 1`,
    sql<Delivery['problems']>`
      select e.occurred_at, e.type, e.recipient, e.smtp_code, e.detail, m.from_address
      from api.mail_events e left join api.mail_messages m on m.id = e.message_id
      where e.type in ${sql(PROBLEM_TYPES)} and e.occurred_at >= now() - interval '30 days'
      order by e.occurred_at desc
      limit 100`,
  ]);
  return { ...h, days, problems };
}

/** Users' mailboxes with their last 30 days. Counts only: never email content. */
export async function mailboxes(sql: Sql): Promise<MailboxRow[]> {
  return sql<MailboxRow[]>`
    select b.id, b.address, b.status, b.paused_reason, b.verified_at, b.created_at, u.email as owner_email,
      coalesce(s.sent, 0) as sent, coalesce(s.delivered, 0) as delivered, coalesce(s.bounced, 0) as bounced,
      coalesce(s.complained, 0) as complained, coalesce(s.opened, 0) as opened, coalesce(s.clicked, 0) as clicked,
      coalesce(s.received, 0) as received, s.last_at
    from api.mailboxes b
    left join api.users u on u.id = b.user_id
    left join lateral (
      select
        count(*) filter (where m.direction = 'outbound' and m.sent_at is not null)::int as sent,
        count(*) filter (where m.direction = 'outbound' and m.delivered_at is not null)::int as delivered,
        count(*) filter (where m.status = 'bounced')::int as bounced,
        count(*) filter (where m.status = 'complained')::int as complained,
        count(*) filter (where m.direction = 'outbound' and m.open_count > 0)::int as opened,
        count(*) filter (where m.direction = 'outbound' and m.click_count > 0)::int as clicked,
        count(*) filter (where m.direction = 'inbound' and not m.is_system_check)::int as received,
        max(coalesce(m.sent_at, m.received_at)) as last_at
      from api.mail_messages m
      where m.mailbox_id = b.id and m.created_at >= now() - interval '30 days'
    ) s on true
    where not b.team and b.status <> 'retired'
    order by s.last_at desc nulls last, b.created_at desc
    limit 1000`;
}

const THREAD_COLUMNS = (sql: Sql) => sql`
  t.id, b.address as mailbox, t.subject, t.counterpart_address, t.counterpart_name, t.snippet, t.unread_count,
  t.message_count, t.last_direction, t.last_message_at, t.team_done_at,
  (select m.sent_by from api.mail_messages m where m.thread_id = t.id and m.direction = 'outbound'
    order by m.created_at desc limit 1) as last_sent_by,
  nullif(trim(concat_ws(' ', u.first_name, u.last_name)), '') as user_name, u.created_at as user_since`;

export async function teamThreads(sql: Sql): Promise<TeamThread[]> {
  return sql<TeamThread[]>`
    select ${THREAD_COLUMNS(sql)}
    from api.mail_threads t
    join api.mailboxes b on b.id = t.mailbox_id
    left join api.users u on lower(u.email) = t.counterpart_address
    where b.team
    order by t.last_message_at desc
    limit 500`;
}

async function teamThreadRow(sql: Sql, id: string): Promise<TeamThread | null> {
  const [thread] = await sql<TeamThread[]>`
    select ${THREAD_COLUMNS(sql)}
    from api.mail_threads t
    join api.mailboxes b on b.id = t.mailbox_id
    left join api.users u on lower(u.email) = t.counterpart_address
    where t.id = ${id} and b.team`;
  return thread ?? null;
}

/** One team thread with its messages; opening it marks it read. Null when it is not team mail. */
export async function teamThread(sql: Sql, id: string): Promise<TeamThreadDetail | null> {
  const thread = await teamThreadRow(sql, id);
  if (!thread) return null;
  const messages = await sql<TeamMessage[]>`
    select id, direction, from_address, from_name, coalesce(nullif(text_new, ''), text_body) as text, status, sent_by,
      coalesce(sent_at, received_at, created_at) as at
    from api.mail_messages where thread_id = ${id} order by created_at`;
  if (thread.unreadCount > 0) {
    await sql`update api.mail_messages set read_at = now() where thread_id = ${id} and direction = 'inbound' and read_at is null`;
    await sql`update api.mail_threads set unread_count = 0, updated_at = now() where id = ${id}`;
  }
  return { thread: { ...thread, unreadCount: 0 }, messages };
}

/** Mark done (no reply needed) or move back to Needs reply. A new reply from them clears it (Express). */
export async function setDone(sql: Sql, id: string, done: boolean): Promise<TeamThread | null> {
  const [hit] = await sql`
    update api.mail_threads t set team_done_at = ${done ? sql`now()` : null}, updated_at = now()
    from api.mailboxes b where b.id = t.mailbox_id and b.team and t.id = ${id}
    returning t.id`;
  return hit ? teamThreadRow(sql, id) : null;
}

export interface ReplyTarget {
  threadId: string;
  mailboxId: string;
  mailboxAddress: string;
  subject: string;
  to: string;
  inReplyTo: string | null;
  references: string[];
}

const MAX_REFERENCES = 20;

/** What a reply needs: the team address, who to answer, and the ids that keep it in the same conversation. */
export async function replyTarget(sql: Sql, threadId: string): Promise<ReplyTarget | null> {
  const [row] = await sql<Array<{ mailboxId: string; mailboxAddress: string; subject: string; toAddress: string }>>`
    select b.id as mailbox_id, b.address as mailbox_address, t.subject, t.counterpart_address as to_address
    from api.mail_threads t join api.mailboxes b on b.id = t.mailbox_id
    where t.id = ${threadId} and b.team`;
  if (!row) return null;
  const [last] = await sql<Array<{ id: string; rfcMessageId: string }>>`
    select id, rfc_message_id from api.mail_messages where thread_id = ${threadId} order by created_at desc limit 1`;
  const refs = last
    ? (await sql<Array<{ referenceId: string }>>`
        select reference_id from api.mail_message_references where message_id = ${last.id} order by position`).map((r) => r.referenceId)
    : [];
  return {
    threadId,
    mailboxId: row.mailboxId,
    mailboxAddress: row.mailboxAddress,
    subject: /^re:/i.test(row.subject) ? row.subject : `Re: ${row.subject}`,
    to: row.toAddress,
    inReplyTo: last?.rfcMessageId ?? null,
    references: last ? [...refs, last.rfcMessageId].slice(-MAX_REFERENCES) : [],
  };
}

function snippetOf(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length > 140 ? `${line.slice(0, 139)}…` : line;
}

/** Records a sent team reply the way Express records a user's sent email (send.service markSent). */
export async function recordReply(sql: Sql, target: ReplyTarget, messageId: string, text: string, sentBy: string): Promise<void> {
  const snippet = snippetOf(text);
  await sql.begin(async (tx) => {
    const [message] = await tx<Array<{ id: string }>>`
      insert into api.mail_messages (thread_id, mailbox_id, direction, rfc_message_id, in_reply_to, from_address, from_name,
        subject, text_body, snippet, status, cf_message_id, sent_at, sent_by)
      values (${target.threadId}, ${target.mailboxId}, 'outbound', ${messageId}, ${target.inReplyTo}, ${target.mailboxAddress},
        'Appyl', ${target.subject}, ${text}, ${snippet}, 'sent', ${messageId}, now(), ${sentBy})
      returning id`;
    await tx`insert into api.mail_message_recipients (message_id, kind, position, address) values (${message!.id}, 'to', 0, ${target.to})`;
    for (const [position, referenceId] of target.references.entries()) {
      await tx`insert into api.mail_message_references (message_id, position, reference_id) values (${message!.id}, ${position}, ${referenceId})`;
    }
    await tx`
      update api.mail_threads
      set message_count = message_count + 1, unread_count = 0, last_direction = 'outbound', last_message_at = now(),
        snippet = ${snippet}, team_done_at = null, updated_at = now()
      where id = ${target.threadId}`;
  });
}

// ---------------------------------------------------------------------------
// Platform metrics (the Platform dashboard and the Users page)

export async function platform(sql: Sql): Promise<Platform> {
  const [[users], [matches], stageRows, [documents], signups] = await Promise.all([
    sql<Array<Platform['users']>>`
      select count(*)::int as total,
        count(*) filter (where private_beta_access_at is not null)::int as admitted,
        count(*) filter (where onboarding_completed_at is not null)::int as onboarded,
        count(*) filter (where created_at >= now() - interval '7 days')::int as new_this_week,
        (select count(distinct user_id)::int from api.profile_sources where source_type = 'resume') as with_resume_source
      from api.users`,
    sql<Array<Platform['matches']>>`
      select count(*) filter (where match_fit_counts is not null and ((match_fit_counts->>'excellent')::int + (match_fit_counts->>'good')::int) > 0)::int as users_with_matches,
        count(*) filter (where (match_fit_counts->>'excellent')::int > 0)::int as users_with_excellent,
        coalesce(sum((match_fit_counts->>'excellent')::int), 0)::int as excellent,
        coalesce(sum((match_fit_counts->>'good')::int), 0)::int as good,
        coalesce(sum((match_fit_counts->>'borderline')::int), 0)::int as borderline
      from api.users`,
    sql<Array<{ stage: Stage; applications: number; people: number }>>`
      select stage, count(*)::int as applications, count(distinct user_id)::int as people
      from api.applications where archived_at is null group by stage`,
    sql<Array<Platform['documents']>>`
      select
        (select count(*)::int from api.application_resumes where is_current and finalized_at is not null) as resumes_finalized,
        (select count(*)::int from api.application_cover_letters where is_current and body <> '')
          + (select count(*)::int from api.user_cover_letters where is_current and body <> '') as cover_letters,
        (select count(*)::int from api.interview_prep_sessions) as interview_prep_sessions`,
    sql<Platform['signups']>`
      select to_char(w, 'YYYY-MM-DD') as week, count(u.id)::int as n
      from generate_series(date_trunc('week', now()) - interval '11 weeks', date_trunc('week', now()), interval '1 week') as w
      left join api.users u on date_trunc('week', u.created_at) = w
      group by w order by w`,
  ]);
  const stages = STAGES.map((stage) => stageRows.find((r) => r.stage === stage) ?? { stage, applications: 0, people: 0 });
  return { users: users!, matches: matches!, stages, documents: documents!, signups, asOf: new Date().toISOString() };
}

/** Everyone, newest first, with where they are. Counts only: no profile or document content. */
export async function platformUsers(sql: Sql): Promise<PlatformUser[]> {
  return sql<PlatformUser[]>`
    select u.id, u.email, nullif(trim(concat_ws(' ', u.first_name, u.last_name)), '') as name, u.created_at as joined_at,
      (u.private_beta_access_at is not null) as admitted, (u.onboarding_completed_at is not null) as onboarded,
      (u.match_fit_counts->>'excellent')::int as excellent, (u.match_fit_counts->>'good')::int as good,
      coalesce((select jsonb_object_agg(stage, n) from (select stage, count(*)::int as n from api.applications a
        where a.user_id = u.id and a.archived_at is null group by stage) s), '{}'::jsonb) as stages,
      (select count(*)::int from api.application_resumes r join api.applications a on a.id = r.application_id
        where a.user_id = u.id and r.is_current and r.finalized_at is not null) as resumes,
      (select count(*)::int from api.application_cover_letters c join api.applications a on a.id = c.application_id
        where a.user_id = u.id and c.is_current and c.body <> '') as cover_letters,
      greatest(u.updated_at, (select max(a.updated_at) from api.applications a where a.user_id = u.id)) as last_active_at
    from api.users u
    order by u.created_at desc
    limit 2000`;
}
