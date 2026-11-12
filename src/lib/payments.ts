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

/** Sum of ad-hoc bonuses awarded to this user (see BonusPayment in schema.prisma). */
export async function getBonusPence(userId: string): Promise<number> {
  const agg = await db.bonusPayment.aggregate({ where: { userId }, _sum: { amountPence: true } });
  return agg._sum.amountPence ?? 0;
}

/**
 * Everything this person is owed to date: completion commission plus any
 * ad-hoc bonuses. Staff invoice the two together, so "outstanding" and the
 * staff invoice cap both work off the combined total, while the breakdown is
 * kept so the UI can show where the figure comes from.
 */
export async function getEarnedBreakdown(userId: string) {
  const [commissionPence, bonusPence] = await Promise.all([getLifetimeEarnedPence(userId), getBonusPence(userId)]);
  return { commissionPence, bonusPence, totalPence: commissionPence + bonusPence };
}

export const MAX_INVOICE_FILE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_INVOICE_MIME_TYPES = ["application/pdf", "image/png", "image/jpeg"];

/**
 * Paid so far across both invoice types: uploaded invoices marked PAID, plus
 * self-billed invoices marked PAID (net of VAT — VAT isn't commission).
 */
export async function getPaidPence(userId: string): Promise<number> {
  const [uploaded, selfBilled] = await Promise.all([
    db.staffInvoice.aggregate({ where: { userId, status: "PAID" }, _sum: { amountPence: true } }),
    db.selfBilledInvoice.aggregate({ where: { userId, kind: "INVOICE", status: "PAID" }, _sum: { netPence: true } }),
  ]);
  return (uploaded._sum.amountPence ?? 0) + (selfBilled._sum.netPence ?? 0);
}

/**
 * Net amount credited back by issued self-billed credit notes (a positive
 * number). A credit note corrects an over-invoice, so it reduces what the
 * person is owed: outstanding = earned − credited − paid.
 */
export async function getCreditedPence(userId: string): Promise<number> {
  const agg = await db.selfBilledInvoice.aggregate({
    where: { userId, kind: "CREDIT_NOTE", status: { in: ["ISSUED", "QUERIED", "ACCEPTED", "PAID"] } },
    _sum: { netPence: true },
  });
  return -(agg._sum.netPence ?? 0);
}

/**
 * How much someone may still invoice by upload. Commission for months covered
 * by a self-billing agreement (and bonuses awarded in them) is invoiced by Move
 * Hub, so only months outside any agreement count here. Agreements always run
 * whole calendar months, so "is this month covered" is all that's needed.
 */
export async function getUploadAllowancePence(userId: string): Promise<{ allowancePence: number; hasAgreement: boolean }> {
  const [agreements, snapshots, completions, bonuses, uploaded, settings] = await Promise.all([
    db.selfBillingAgreement.findMany({ where: { userId }, select: { startDate: true, endDate: true } }),
    db.monthlySnapshot.findMany({ where: { userId } }),
    db.completedMatter.findMany({ where: { userId }, select: { completionDate: true } }),
    db.bonusPayment.findMany({ where: { userId }, select: { amountPence: true, awardedAt: true } }),
    db.staffInvoice.aggregate({ where: { userId }, _sum: { amountPence: true } }),
    getSettings(),
  ]);
  // Ignore any ended before it started — it never took effect.
  const agreementsInEffect = agreements.filter((a) => a.endDate >= a.startDate);
  const covered = (d: Date) => agreementsInEffect.some((a) => d >= a.startDate && d.getTime() < a.endDate.getTime() + 86400000);
  const keyOf = (d: Date) => `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`;
  const monthStart = (key: string) => {
    const [y, m] = key.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, 1));
  };

  const snapshotByKey = new Map(snapshots.map((s) => [`${s.year}-${s.month}`, s.fileCountAtStart]));
  const countByKey = new Map<string, number>();
  for (const c of completions) countByKey.set(keyOf(c.completionDate), (countByKey.get(keyOf(c.completionDate)) ?? 0) + 1);

  let earned = 0;
  for (const key of new Set([...snapshotByKey.keys(), ...countByKey.keys()])) {
    if (covered(monthStart(key))) continue;
    earned += calculateCommission({
      fileCountAtStart: snapshotByKey.get(key) ?? null,
      completions: countByKey.get(key) ?? 0,
      commissionPerMatterPence: settings.commissionPerMatterPence,
      bonusUpliftPercent: settings.bonusUpliftPercent,
      bonusThresholdNumerator: settings.bonusThresholdNumerator,
      bonusThresholdDenominator: settings.bonusThresholdDenominator,
    }).totalPence;
  }
  earned += bonuses.filter((b) => !covered(b.awardedAt)).reduce((s, b) => s + b.amountPence, 0);
  return { allowancePence: earned - (uploaded._sum.amountPence ?? 0), hasAgreement: agreementsInEffect.length > 0 };
}
