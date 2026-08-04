import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { monthRange } from "@/lib/date";
import { calculateCommission } from "@/lib/commission";

/**
 * Sums calculateCommission's totalPence across every month this user has a
 * MonthlySnapshot for — their full commission earned to date, not scoped to
 * any single period. "Outstanding" is this minus whatever's already been
 * marked PAID on their invoices, so an invoice covering more than one month
 * (or a gap with no invoice yet) both just fall out of the same subtraction.
 */
export async function getLifetimeEarnedPence(userId: string): Promise<number> {
  const [snapshots, settings] = await Promise.all([
    db.monthlySnapshot.findMany({ where: { userId } }),
    getSettings(),
  ]);

  let total = 0;
  for (const snap of snapshots) {
    const { start, end } = monthRange(snap.year, snap.month);
    const completions = await db.completedMatter.count({
      where: { userId, completionDate: { gte: start, lt: end } },
    });
    const calc = calculateCommission({
      fileCountAtStart: snap.fileCountAtStart,
      completions,
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
