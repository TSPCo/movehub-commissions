# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

## Prisma generate warning

After running `npx prisma generate`, the file `src/generated/prisma/index.ts` gets deleted.
Re-create it immediately with:

```ts
export * from "./client";
export * from "./enums";
export * from "./models";
```

All app imports use `@/generated/prisma` — without this barrel file, TypeScript will error on every enum and model import.

**After any `prisma/schema.prisma` change**, `npm run db:push` alone is not enough — it only syncs the database, it does not regenerate the client. Run `npx prisma generate` (then restore the barrel file above) and **fully restart the Next.js dev server** if one is running — Turbopack caches the old generated client's module shape and will keep throwing `Unknown argument` Prisma errors on new fields until the process restarts.

## Database: Postgres only

`prisma/schema.prisma`'s `datasource provider` is `"postgresql"` and `src/lib/db.ts`/`prisma/seed.ts` use `@prisma/adapter-pg`'s `PrismaPg`. `DATABASE_URL` must be a `postgresql://...` connection string for every environment, including local dev — this app started Postgres-only from day one (unlike `movehub-invoicing`, which briefly used SQLite before its own deploy).

## Sibling apps

Scaffolded from `/Users/mathew/movehub-invoicing` (config/build conventions) and `/Users/mathew/movehub-holidays` (invite-based multi-user auth pattern — this app has real staff logging in, unlike `movehub-invoicing`'s single admin). Also shares the same `INTOUCH_API_KEY` (one account-level key) and the throttled-InTouch-client pattern with `movehub-invoicing`, `sales-progression`, and `tspc-invoicing` — InTouch enforces 60 requests/60s **account-wide across all of them**, so any new InTouch code here must reuse the same `throttle()`-in-`intouchFetch` pattern, not a naive per-loop delay.

## InTouch: "Completion" vs "Contracts Exchanged"

`movehub-invoicing` triggers on a matter's **"Contracts Exchanged"** task (for billing Purplebricks at exchange). This app deliberately triggers on the **later, separate "Completion"** task instead — legally and commercially a different event, and the one commissions are actually owed against. Don't conflate the two if code or logic is ever shared between the apps.
