import "server-only";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { monthRange } from "@/lib/date";
import { missingInvoiceFields } from "@/lib/staffDetails";
import { buildLines, monthKey, monthKeyOf, monthLabel, type MonthKey } from "./lines";

/** Previous calendar month (UTC), the one the cron invoices on/after the 1st. */
export function previousMonth(now = new Date()) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  return m === 1 ? { year: y - 1, month: 12 } : { year: y, month: m - 1 };
}

type Window = { start: Date; endExclusive: Date };

export type GenerateSummary = {
  year: number;
  month: number;
  created: { userId: string; name: string; invoiceId: string; netPence: number; warnings: string[] }[];
  skipped: { userId: string; name: string; reason: string }[];
  unmatchedCompletions: number;
};

/**
 * Creates DRAFT self-billed invoices for one month, for everyone with an
 * agreement that has anything to bill. Idempotent: anyone who already has a
 * live (non-void) invoice for the month is skipped, so the cron can run daily.
 */
export async function generateDrafts(year: number, month: number, onlyUserId?: string): Promise<GenerateSummary> {
  const { start: periodStart, end: periodEnd } = monthRange(year, month);
  const lastDay = new Date(periodEnd.getTime() - 86400000);
  const settings = await getSettings();

  const agreements = await db.selfBillingAgreement.findMany({
    where: { userId: onlyUserId ? onlyUserId : { not: null }, startDate: { lt: periodEnd } },
    orderBy: { startDate: "asc" },
  });
  const byUser = new Map<string, typeof agreements>();
  for (const a of agreements) byUser.set(a.userId!, [...(byUser.get(a.userId!) ?? []), a]);

  const unmatchedCompletions = await db.completedMatter.count({
    where: { userId: null, completionDate: { gte: periodStart, lt: periodEnd } },
  });

  const summary: GenerateSummary = { year, month, created: [], skipped: [], unmatchedCompletions };

  for (const [userId, userAgreements] of byUser) {
    const user = await db.user.findUnique({ where: { id: userId }, select: { name: true, email: true, staffDetails: true } });
    if (!user) continue;
    const name = user.name ?? user.email;

    const existing = await db.selfBilledInvoice.findFirst({
      where: { userId, kind: "INVOICE", periodYear: year, periodMonth: month, status: { not: "VOID" } },
      select: { id: true },
    });
    if (existing) {
      summary.skipped.push({ userId, name, reason: "Already has an invoice for this month" });
      continue;
    }

    // Items are self-billed only if dated inside one of their agreements.
    const windows: Window[] = userAgreements.map((a) => ({
      start: a.startDate,
      endExclusive: new Date(Math.min(a.endDate.getTime() + 86400000, periodEnd.getTime())),
    }));
    const inWindow = (d: Date) => windows.some((w) => d >= w.start && d < w.endExclusive);
    const covering = userAgreements.find((a) => a.startDate <= periodStart && a.endDate >= lastDay) ?? null;

    const [rawCompletions, rawBonuses] = await Promise.all([
      db.completedMatter.findMany({
        where: { userId, selfBilledLineId: null, completionDate: { lt: periodEnd } },
        select: { id: true, address: true, postcode: true, completionDate: true },
      }),
      db.bonusPayment.findMany({
        where: { userId, selfBilledLineId: null, awardedAt: { lt: periodEnd } },
        select: { id: true, amountPence: true, note: true, type: true, awardedAt: true },
      }),
    ]);
    const unbilledCompletions = rawCompletions.filter((c) => inWindow(c.completionDate));
    const unbilledBonuses = rawBonuses.filter((b) => inWindow(b.awardedAt));

    const months = new Set<MonthKey>(unbilledCompletions.map((c) => monthKeyOf(c.completionDate)));
    if (covering) months.add(monthKey(year, month));
    const monthList = [...months].map((k) => k.split("-").map(Number) as [number, number]);

    const [snapshots, counts, billedUplift] = await Promise.all([
      db.monthlySnapshot.findMany({ where: { userId, OR: monthList.map(([y, m]) => ({ year: y, month: m })) } }),
      Promise.all(
        monthList.map(async ([y, m]) => {
          const r = monthRange(y, m);
          return [monthKey(y, m), await db.completedMatter.count({ where: { userId, completionDate: { gte: r.start, lt: r.end } } })] as const;
        })
      ),
      db.selfBilledInvoiceLine.findMany({
        where: { type: "PERFORMANCE_BONUS", invoice: { userId, status: { not: "VOID" } } },
        select: { forYear: true, forMonth: true, amountPence: true },
      }),
    ]);

    const upliftBilledByMonth = new Map<MonthKey, number>();
    for (const l of billedUplift) {
      if (l.forYear == null || l.forMonth == null) continue;
      const k = monthKey(l.forYear, l.forMonth);
      upliftBilledByMonth.set(k, (upliftBilledByMonth.get(k) ?? 0) + l.amountPence);
    }

    const result = buildLines({
      periodYear: year,
      periodMonth: month,
      unbilledCompletions,
      unbilledBonuses,
      completionCountByMonth: new Map(counts),
      snapshotByMonth: new Map(snapshots.map((s) => [monthKey(s.year, s.month), s.fileCountAtStart])),
      upliftBilledByMonth,
      agreementCoversPeriod: covering !== null,
      settings,
      vatRegistered: Boolean(user.staffDetails?.vatRegistered),
    });

    if (result.lines.length === 0) {
      summary.skipped.push({ userId, name, reason: `Nothing to invoice for ${monthLabel(year, month)}` });
      continue;
    }

    const missing = missingInvoiceFields(user.staffDetails);
    if (missing.length) result.warnings.unshift(`Their invoice details are incomplete (${missing.join(", ")}) — it can't be issued until they're filled in.`);
    // Rollout safety: an invoice uploaded after self-billing started could cover the same work.
    const firstStart = userAgreements[0].startDate;
    const uploadsSince = await db.staffInvoice.count({ where: { userId, createdAt: { gte: firstStart } } });
    if (uploadsSince > 0) {
      result.warnings.push(`They've uploaded ${uploadsSince} invoice${uploadsSince === 1 ? "" : "s"} of their own since self-billing started — check none of it covers ${monthLabel(year, month)} before issuing.`);
    }
    if (unmatchedCompletions > 0) {
      result.warnings.push(`${unmatchedCompletions} completion${unmatchedCompletions === 1 ? "" : "s"} in ${monthLabel(year, month)} couldn't be matched to anyone — check fee earner names on the Staff page before issuing.`);
    }

    const invoice = await db.$transaction(async (tx) => {
      const inv = await tx.selfBilledInvoice.create({
        data: {
          userId,
          agreementId: (covering ?? userAgreements[userAgreements.length - 1]).id,
          periodYear: year,
          periodMonth: month,
          netPence: result.netPence,
          vatPence: result.vatPence,
          grossPence: result.grossPence,
          vatRatePercent: result.vatRatePercent,
          warnings: result.warnings,
        },
      });
      for (const [i, l] of result.lines.entries()) {
        const line = await tx.selfBilledInvoiceLine.create({
          data: {
            invoiceId: inv.id,
            type: l.type,
            description: l.description,
            amountPence: l.amountPence,
            matterAddress: l.matterAddress,
            completionDate: l.completionDate,
            forYear: l.forYear,
            forMonth: l.forMonth,
            sortOrder: i,
          },
        });
        // updateMany + selfBilledLineId: null guards against a concurrent run billing the same item twice.
        if (l.completionId) {
          const r = await tx.completedMatter.updateMany({ where: { id: l.completionId, selfBilledLineId: null }, data: { selfBilledLineId: line.id } });
          if (r.count !== 1) throw new Error("Completion already billed — generation raced another run");
        }
        if (l.bonusId) {
          const r = await tx.bonusPayment.updateMany({ where: { id: l.bonusId, selfBilledLineId: null }, data: { selfBilledLineId: line.id } });
          if (r.count !== 1) throw new Error("Bonus already billed — generation raced another run");
        }
      }
      return inv;
    });

    summary.created.push({ userId, name, invoiceId: invoice.id, netPence: result.netPence, warnings: result.warnings });
  }

  return summary;
}
