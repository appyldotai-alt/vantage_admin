# vantage_admin

`admin.appyl.ai` (prod) and `dev.admin.appyl.ai` (dev): the team's view of Appyl. Platform metrics, users, the team inbox (replies to Appyl's emails), mailbox counts and delivery. One Cloudflare Worker per environment on the **Appyl Cloudflare account** serves the Quasar app (`src/`, built by Vite) and answers `/api/*` (`worker/`). System doc: [../.agents/systems/admin.md](../.agents/systems/admin.md).

## Commands

```bash
npm run dev          # localhost:5180, dev environment, PlanetScale dev branch (secrets: with-secrets.mjs express-dev; dev:prod uses express-prod)
npm run dev:prod     # localhost:5181, prod data (careful: replies reach real people)
npm run typecheck    # app (vue-tsc) + worker (tsc)
npm run deploy:dev   # build + deploy appyl-admin-dev to dev.admin.appyl.ai
npm run deploy       # build + deploy appyl-admin to admin.appyl.ai
```

The shell's `CLOUDFLARE_API_TOKEN` belongs to another account; the deploy scripts and `npm run cf -- …` unset it and use the `appyl` wrangler profile. Deploys run locally; git (`github.com/appyldotai-alt/vantage_admin`) holds the code. Local dev skips Access only on localhost, through `DEV_NO_ACCESS=1` in `.dev.vars` (gitignored); add `DEV_FIXTURES=1` there to use sample data instead of the database.

## One-time setup (user)

1. **Hyperdrive, one per environment** (binding `DB` in each `wrangler.jsonc` environment). Use a Postgres role that can read `api.*` and write `mail_messages`, `mail_message_recipients`, `mail_message_references` and `mail_threads`. Put each returned id in `wrangler.jsonc` (top level = prod, `env.dev` = dev).
   ```bash
   npm run cf -- hyperdrive create appyl-admin-prod --connection-string="postgres://…main branch…"
   npm run cf -- hyperdrive create appyl-admin-dev --connection-string="postgres://…dev branch…"
   ```
2. **Cloudflare Access.** Zero Trust → Access → Applications → Self-hosted, with both `admin.appyl.ai` and `dev.admin.appyl.ai`, and a policy that allows only the team's emails. Copy the team domain (`https://<team>.cloudflareaccess.com`) and the Application Audience (AUD) tag into `vars` in both environments. With either empty the Worker refuses every request.
3. **Order of deploys:** migration 0049 on the branch, Express (API + worker) for that environment, then `vantage_workers/mail` (it starts keeping team replies), then this Worker.

## Rules

- SQL in `worker/db.ts` follows `vantage_express/packages/database/src/schema/`; a schema change there may need a change here.
- Show users' mailbox counts and platform numbers, never their email or document content. Only team mail is readable here.
- Team replies go out only as the addresses in `send_email.allowed_sender_addresses`.
