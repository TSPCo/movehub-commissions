# Move Hub Commissions

Staff commission tracker for The Move Hub. £X per completed matter, plus a monthly bonus uplift if a team member completes at least a set fraction of the files they had open at the start of the month.

## Stack

Next.js 16 (App Router) + Prisma 7 + Postgres + Tailwind v4 + custom email/password auth (invite-based, admin-approval password reset — same pattern as `movehub-holidays`).

## Getting started

Requires a Postgres database (`DATABASE_URL`) — there's no SQLite fallback.

```bash
cp .env.example .env
npm install
npm run db:push
npm run db:seed
npm run dev
```

Runs on [http://localhost:3460](http://localhost:3460). Seeded admin: `admin@move-hub.co.uk` / `changeme123` (override with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` env vars before seeding).

## How it works

1. **Staff onboarding** — an admin invites someone from the Staff page (email + role + their InTouch fee earner name, e.g. "Sam Rodgers" — must match InTouch exactly, since that's how completions get attributed to them). Like `movehub-holidays`, invites and password resets are link-only (an admin gets a copyable one-time link to share) — no email is ever sent by this app.
2. **Monthly snapshot** — on (or shortly after) the 1st of each month, `POST /api/cron/monthly-snapshot` (meant to be hit by a Railway Cron Job, `CRON_SECRET`-protected) records each staff member's current InTouch open-file count as their month-start baseline. Idempotent per (user, month) — a repeat/accidental run never overwrites an existing snapshot. An admin can also trigger it manually from the Team Overview page.
3. **Completion sync** — `POST /api/cron/sync-completions` (also `CRON_SECRET`-protected, meant to run more often, e.g. daily) polls InTouch for Move Hub matters whose **"Completion"** task (not "Contracts Exchanged" — a later, separate milestone) has been marked done, and records each one — deduped by InTouch matter guid, attributed to a staff member by matching InTouch's fee-earner name against their `intouchFeeEarnerName`. No match still gets recorded (just unattributed) so it surfaces on the admin page rather than silently vanishing. An admin can also trigger this manually.
4. **My Commission** (every staff member sees their own) — for a selected month: files at month start, matters completed, bonus progress, and total commission owed.
5. **Team Overview** (admin only) — the same breakdown for every team member at once, plus the combined total owed, and a list of any unattributed completions with a manual "assign to" picker.
6. **Settings** (admin only) — the commission-per-matter amount, bonus uplift percentage, the bonus threshold fraction (default 1/3, rounded down), and a cutoff date so the completion sync never imports historical completions from before this scheme started.

## InTouch integration

Requires `INTOUCH_API_KEY` — same account-level key as `movehub-invoicing`, `sales-progression`, and `tspc-invoicing`. InTouch enforces a **60 requests/60 seconds limit shared across all of these apps**, not per app — `src/lib/intouch.ts` throttles to ~57 req/min centrally in `intouchFetch`, matching the fix applied to the other three apps. Without the key, sync buttons return a 503 and nothing else is affected.

## Deploying (e.g. Railway)

1. Set `DATABASE_URL`, `SESSION_SECRET`, `INTOUCH_API_KEY`, `CRON_SECRET`, and `APP_URL` in Railway's environment variables.
2. Build command: `npm run build`. Start command: `npm run start`.
3. Run `npm run db:push` once against the production database, then `npm run db:seed` to create the first admin user.
4. Add two Railway Cron Job services hitting this app:
   - Monthly, just after midnight on the 1st: `POST /api/cron/monthly-snapshot` with header `Authorization: Bearer <CRON_SECRET>`
   - Daily (or more often): `POST /api/cron/sync-completions` with the same header
