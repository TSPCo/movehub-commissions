import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLines, monthKey, type LinesInput } from "./lines";

const settings = { commissionPerMatterPence: 10000, bonusUpliftPercent: 10, bonusThresholdNumerator: 1, bonusThresholdDenominator: 3 };
const d = (s: string) => new Date(`${s}T12:00:00Z`);
const base = (over: Partial<LinesInput> = {}): LinesInput => ({
  periodYear: 2026,
  periodMonth: 12,
  unbilledCompletions: [],
  unbilledBonuses: [],
  completionCountByMonth: new Map(),
  snapshotByMonth: new Map(),
  upliftBilledByMonth: new Map(),
  agreementCoversPeriod: true,
  settings,
  vatRegistered: false,
  ...over,
});

test("one line per completion at the per-matter rate, plus bonuses labelled by type", () => {
  const r = buildLines(
    base({
      unbilledCompletions: [
        { id: "c2", address: "2 High St", postcode: "SK4 1AA", completionDate: d("2026-12-10") },
        { id: "c1", address: "1 High St", postcode: null, completionDate: d("2026-12-03") },
      ],
      unbilledBonuses: [
        { id: "b1", amountPence: 5000, note: "Referred the Smith sale", type: "REFERRAL", awardedAt: d("2026-12-20") },
        { id: "b2", amountPence: 2500, note: "Christmas", type: "DISCRETIONARY", awardedAt: d("2026-12-21") },
      ],
    })
  );
  assert.deepEqual(r.lines.map((l) => l.type), ["COMPLETION", "COMPLETION", "REFERRAL_FEE", "ADHOC_BONUS"]);
  assert.equal(r.lines[0].completionId, "c1");
  assert.equal(r.netPence, 27500);
  assert.equal(r.vatPence, 0);
  assert.equal(r.vatRatePercent, null);
});

test("performance uplift when completions reach a third of month-start files", () => {
  const completions = [1, 2, 3].map((i) => ({ id: `c${i}`, address: `${i} Road`, postcode: null, completionDate: d(`2026-12-0${i}`) }));
  const r = buildLines(base({ unbilledCompletions: completions, completionCountByMonth: new Map([[monthKey(2026, 12), 3]]), snapshotByMonth: new Map([[monthKey(2026, 12), 9]]) }));
  const bonus = r.lines.find((l) => l.type === "PERFORMANCE_BONUS");
  assert.equal(bonus?.amountPence, 3000); // 10% of £300
  assert.equal(bonus?.forMonth, 12);
  assert.equal(r.netPence, 33000);
});

test("a late completion rolls forward and tops up the earlier month's uplift", () => {
  // November was invoiced with 2 completions, no uplift (target 3 of 9). A 3rd November
  // completion syncs late: it goes on December's invoice and November now hits target.
  const r = buildLines(
    base({
      unbilledCompletions: [{ id: "late", address: "9 Late Lane", postcode: null, completionDate: d("2026-11-28") }],
      completionCountByMonth: new Map([[monthKey(2026, 11), 3]]),
      snapshotByMonth: new Map([[monthKey(2026, 11), 9], [monthKey(2026, 12), 30]]),
    })
  );
  assert.equal(r.lines[0].type, "COMPLETION");
  assert.match(r.lines[0].description, /earlier month/);
  const top = r.lines.find((l) => l.type === "PERFORMANCE_BONUS");
  assert.equal(top?.forMonth, 11);
  assert.equal(top?.amountPence, 3000);
});

test("uplift already billed isn't billed again", () => {
  const r = buildLines(
    base({
      completionCountByMonth: new Map([[monthKey(2026, 12), 3]]),
      snapshotByMonth: new Map([[monthKey(2026, 12), 9]]),
      upliftBilledByMonth: new Map([[monthKey(2026, 12), 3000]]),
    })
  );
  assert.equal(r.lines.length, 0);
});

test("missing month-start snapshot is flagged, not silently skipped", () => {
  const r = buildLines(base({ unbilledCompletions: [{ id: "c", address: "1 Road", postcode: null, completionDate: d("2026-12-02") }], completionCountByMonth: new Map([[monthKey(2026, 12), 1]]) }));
  assert.equal(r.lines.length, 1);
  assert.match(r.warnings[0], /No month-start file count for December 2026/);
});

test("VAT at 20% for a VAT-registered progressor", () => {
  const r = buildLines(base({ vatRegistered: true, unbilledCompletions: [{ id: "c", address: "1 Road", postcode: null, completionDate: d("2026-12-02") }] }));
  assert.deepEqual([r.netPence, r.vatPence, r.grossPence, r.vatRatePercent], [10000, 2000, 12000, 20]);
});
