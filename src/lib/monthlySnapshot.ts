import { db } from "@/lib/db";
import { getOpenFileCountsByFeeEarner } from "@/lib/intouch";

export interface SnapshotSummary {
  year: number;
  month: number;
  created: number;
  alreadyExisted: number;
  users: number;
}

/**
 * Records each staff member's current InTouch open-file count as their
 * "start of month" baseline for the given year/month (defaults to now).
 * Deliberately idempotent per (user, year, month) — once a snapshot exists
 * for a month it's left alone, so an accidental repeat run (or a cron firing
 * more than once) can never overwrite the real month-start figure. Pass
 * `force: true` to intentionally retake it (e.g. an admin fixing a mistake).
 */
export async function runMonthlySnapshot(opts: { year?: number; month?: number; force?: boolean } = {}): Promise<SnapshotSummary> {
  const now = new Date();
  const year = opts.year ?? now.getUTCFullYear();
  const month = opts.month ?? now.getUTCMonth() + 1;

  // Matches the same eligibility as the commission table itself (any non-DISABLED
  // user with a fee-earner name) rather than requiring ACTIVE — someone who's still
  // sitting on a pending invite can already have real completions attributed to them
  // in InTouch, and would otherwise never get a "files at start" baseline at all.
  const users = await db.user.findMany({
    where: { status: { not: "DISABLED" }, intouchFeeEarnerName: { not: null } },
    select: { id: true, intouchFeeEarnerName: true },
  });

  const counts = await getOpenFileCountsByFeeEarner();

  let created = 0;
  let alreadyExisted = 0;

  for (const user of users) {
    const fileCountAtStart = counts.get(user.intouchFeeEarnerName!.trim()) ?? 0;

    if (opts.force) {
      await db.monthlySnapshot.upsert({
        where: { userId_year_month: { userId: user.id, year, month } },
        update: { fileCountAtStart },
        create: { userId: user.id, year, month, fileCountAtStart },
      });
      created++;
      continue;
    }

    const existing = await db.monthlySnapshot.findUnique({
      where: { userId_year_month: { userId: user.id, year, month } },
    });
    if (existing) {
      alreadyExisted++;
      continue;
    }
    await db.monthlySnapshot.create({ data: { userId: user.id, year, month, fileCountAtStart } });
    created++;
  }

  return { year, month, created, alreadyExisted, users: users.length };
}
