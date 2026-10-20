# vantage_admin

`admin.appyl.ai`: the team's view of Appyl mail (mailbox counts, delivery, team inbox with replies). One Cloudflare Worker, `appyl-admin`, on the **Appyl Cloudflare account**: it serves the Quasar app (`src/`, built by Vite) and answers `/api/<prod|dev>/*` (`worker/`). System doc: [../.agents/systems/admin.md](../.agents/systems/admin.md).

## Commands

```bash
npm run typecheck   # app (vue-tsc) + worker (tsc)
npm run build       # vite build: dist/client (assets) + dist/appyl_admin (worker)
npm run deploy      # build, then wrangler deploy with the appyl profile
```

The shell's `CLOUDFLARE_API_TOKEN` belongs to another account; `npm run deploy` and `npm run cf -- …` unset it and use the `appyl` wrangler profile. Deploys are run by the user.

## One-time setup (user)

1. **Hyperdrive, one per environment.** Use a Postgres role that can read `api.*` and write the team-mail tables (`mail_messages`, `mail_message_recipients`, `mail_message_references`, `mail_threads`). Put each returned id in `wrangler.jsonc` (`DB_PROD`, `DB_DEV`).
   ```bash
   npm run cf -- hyperdrive create appyl-admin-prod --connection-string="postgres://…"
   npm run cf -- hyperdrive create appyl-admin-dev --connection-string="postgres://…"
   ```
2. **Cloudflare Access.** Zero Trust → Access → Applications → Self-hosted, domain `admin.appyl.ai`, a policy that allows only the team's emails. Copy the team domain (`https://<team>.cloudflareaccess.com`) and the Application Audience (AUD) tag into `vars` in `wrangler.jsonc`. With either empty the Worker refuses every request.
3. **Order of deploys:** run the `mailboxes.team` migration, deploy Express (API + worker), then `vantage_workers/mail` (starts keeping team replies), then this Worker.

## Local dev

`npm run dev` needs a local Postgres URL for each Hyperdrive binding (`CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_DB_DEV`, `…_DB_PROD`) and `DEV_NO_ACCESS=1` in `.dev.vars` (gitignored; skips Access on localhost only).

## Rules

- SQL in `worker/db.ts` follows `vantage_express/packages/database/src/schema/mail.ts`; a schema change there may need a change here.
- Show users' mailbox counts, never their email content. Only team mail is readable here.
- Team replies go out only as the addresses in `send_email.allowed_sender_addresses`.
