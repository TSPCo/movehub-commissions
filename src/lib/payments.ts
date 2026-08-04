import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { calculateCommission } from "@/lib/commission";

/**
 * Sums calculateCommission's totalPence across every month this user has
 * EITHER a MonthlySnapshot OR a completion in — not just snapshot months.
 * Base commission (completions × per-matter rate) doesn't need a snapshot at
 * all, only the bonus uplift does (calculateCommission already treats a null
 * fileCountAtStart as "no bonus, base still counts"); a month with a
 * completion but no snapshot (e.g. someone was still on a pending invite
 * when that month's snapshot ran) would otherwise have its commission
 * silently dropped from the lifetime total entirely.
 *
 * This is their full commission earned to date, not scoped to any single
 * period. "Outstanding" is this minus whatever's already been marked PAID on
 * their invoices, so an invoice covering more than one month (or a gap with
 * no invoice yet) both just fall out of the same subtraction.
 */
export async function getLifetimeEarnedPence(userId: string): Promise<number> {
  const [snapshots, completions, settings] = await Promise.all([
    db.monthlySnapshot.findMany({ where: { userId } }),
    db.completedMatter.findMany({ where: { userId }, select: { completionDate: true } }),
    getSettings(),
  ]);

  const snapshotByKey = new Map(snapshots.map((s) => [`${s.year}-${s.month}`, s.fileCountAtStart]));

  const completionCountByKey = new Map<string, number>();
  for (const c of completions) {
    const key = `${c.completionDate.getUTCFullYear()}-${c.completionDate.getUTCMonth() + 1}`;
    completionCountByKey.set(key, (completionCountByKey.get(key) ?? 0) + 1);
  }

  const allKeys = new Set([...snapshotByKey.keys(), ...completionCountByKey.keys()]);

  let total = 0;
  for (const key of allKeys) {
    const calc = calculateCommission({
      fileCountAtStart: snapshotByKey.get(key) ?? null,
      completions: completionCountByKey.get(key) ?? 0,
      commissionPerMatterPence: settings.commissionPerMatterPence,
      bonusUpliftPercent: settings.bonusUpliftPercent,
      bonusThresholdNumerator: settings.bonusThresholdNumerator,
      bonusThresholdDenominator: settings.bonusThresholdDenominator,
    });
    total += calc.totalPence;
  }
  return total;
}

export const MAX_INVOICE_FILE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_INVOICE_MIME_TYPES = ["application/pdf", "image/png", "image/jpeg"];
