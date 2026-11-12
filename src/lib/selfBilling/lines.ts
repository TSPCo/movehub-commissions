// Pure invoice-line calculation for a self-billed invoice — no database, so
// the rules (late items roll forward, performance uplift top-ups, VAT) are
// unit-tested in lines.test.ts. generate.ts loads the inputs and saves the result.

import { calculateCommission } from "@/lib/commission";

export const VAT_RATE_PERCENT = 20;

export type MonthKey = `${number}-${number}`;
export const monthKey = (year: number, month: number): MonthKey => `${year}-${month}`;
export const monthKeyOf = (d: Date): MonthKey => monthKey(d.getUTCFullYear(), d.getUTCMonth() + 1);
export const monthLabel = (year: number, month: number) =>
  new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-GB", { timeZone: "UTC", month: "long", year: "numeric" });

export type LineType = "COMPLETION" | "PERFORMANCE_BONUS" | "ADHOC_BONUS" | "REFERRAL_FEE" | "ADJUSTMENT";

export type DraftLine = {
  type: LineType;
  description: string;
  amountPence: number;
  matterAddress?: string;
  completionDate?: Date;
  forYear?: number;
  forMonth?: number;
  completionId?: string;
  bonusId?: string;
};

export type LinesInput = {
  periodYear: number;
  periodMonth: number;
  /** Completions not yet on any invoice, already limited to the agreement window and before the period end. */
  unbilledCompletions: { id: string; address: string; postcode: string | null; completionDate: Date }[];
  /** Bonuses not yet on any invoice, limited the same way. */
  unbilledBonuses: { id: string; amountPence: number; note: string; type: "DISCRETIONARY" | "REFERRAL"; awardedAt: Date }[];
  /** All completions attributed to this person per month (billed or not) — the uplift is worked out on the whole month. */
  completionCountByMonth: Map<MonthKey, number>;
  /** Month-start open-file counts. */
  snapshotByMonth: Map<MonthKey, number>;
  /** Performance bonus already on earlier, non-void invoices, per month. */
  upliftBilledByMonth: Map<MonthKey, number>;
  /** Months whose uplift belongs on this invoice: the period itself if covered by the agreement, plus any earlier month a late completion falls in. */
  agreementCoversPeriod: boolean;
  settings: {
    commissionPerMatterPence: number;
    bonusUpliftPercent: number;
    bonusThresholdNumerator: number;
    bonusThresholdDenominator: number;
  };
  vatRegistered: boolean;
};

export type LinesResult = { lines: DraftLine[]; warnings: string[]; netPence: number; vatPence: number; grossPence: number; vatRatePercent: number | null };

const fmtDate = (d: Date) => d.toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });

export function buildLines(input: LinesInput): LinesResult {
  const lines: DraftLine[] = [];
  const warnings: string[] = [];
  const { periodYear, periodMonth, settings } = input;
  const periodKey = monthKey(periodYear, periodMonth);

  const completions = [...input.unbilledCompletions].sort((a, b) => a.completionDate.getTime() - b.completionDate.getTime());
  for (const c of completions) {
    const late = monthKeyOf(c.completionDate) !== periodKey;
    lines.push({
      type: "COMPLETION",
      description: `Completion — ${c.address}${c.postcode && !c.address.includes(c.postcode) ? `, ${c.postcode}` : ""}${late ? " (completed in an earlier month, not previously invoiced)" : ""}`,
      amountPence: settings.commissionPerMatterPence,
      matterAddress: c.address,
      completionDate: c.completionDate,
      completionId: c.id,
    });
  }

  // Performance uplift per month, minus whatever's already been billed for that month.
  const upliftMonths = new Set<MonthKey>(completions.map((c) => monthKeyOf(c.completionDate)));
  if (input.agreementCoversPeriod) upliftMonths.add(periodKey);
  for (const key of [...upliftMonths].sort()) {
    const [y, m] = key.split("-").map(Number);
    const count = input.completionCountByMonth.get(key) ?? 0;
    const snapshot = input.snapshotByMonth.get(key);
    if (snapshot == null) {
      if (count > 0) warnings.push(`No month-start file count for ${monthLabel(y, m)}, so its performance bonus couldn't be worked out.`);
      continue;
    }
    const calc = calculateCommission({ fileCountAtStart: snapshot, completions: count, ...settings });
    const due = calc.bonusPence - (input.upliftBilledByMonth.get(key) ?? 0);
    if (due > 0) {
      const topUp = (input.upliftBilledByMonth.get(key) ?? 0) > 0;
      lines.push({
        type: "PERFORMANCE_BONUS",
        description: `Performance bonus — ${monthLabel(y, m)}: ${count} completion${count === 1 ? "" : "s"} against a target of ${calc.bonusThreshold} (${settings.bonusUpliftPercent}% uplift)${topUp ? ", top-up after a late completion" : ""}`,
        amountPence: due,
        forYear: y,
        forMonth: m,
      });
    } else if (due < 0) {
      warnings.push(`${monthLabel(y, m)}'s performance bonus now works out lower than was already invoiced — raise a credit note if that's right.`);
    }
  }

  const bonuses = [...input.unbilledBonuses].sort((a, b) => a.awardedAt.getTime() - b.awardedAt.getTime());
  for (const b of bonuses) {
    lines.push({
      type: b.type === "REFERRAL" ? "REFERRAL_FEE" : "ADHOC_BONUS",
      description: `${b.type === "REFERRAL" ? "Referral fee" : "Bonus"} — ${b.note} (awarded ${fmtDate(b.awardedAt)})`,
      amountPence: b.amountPence,
      bonusId: b.id,
    });
  }

  return { lines, warnings, ...totals(lines.map((l) => l.amountPence), input.vatRegistered) };
}

export function totals(amounts: number[], vatRegistered: boolean) {
  const netPence = amounts.reduce((s, a) => s + a, 0);
  const vatPence = vatRegistered ? Math.round((netPence * VAT_RATE_PERCENT) / 100) : 0;
  return { netPence, vatPence, grossPence: netPence + vatPence, vatRatePercent: vatRegistered ? VAT_RATE_PERCENT : null };
}
