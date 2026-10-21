import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { monthRange } from "@/lib/date";
import { calculateCommission } from "@/lib/commission";

export async function GET(request: NextRequest) {
  const year = Number(request.nextUrl.searchParams.get("year"));
  const month = Number(request.nextUrl.searchParams.get("month"));
  if (!year || !month) {
    return NextResponse.json({ error: "year and month query params are required" }, { status: 400 });
  }

  const { start, end } = monthRange(year, month);

  const [users, snapshots, monthCompletions, settings] = await Promise.all([
    db.user.findMany({
      where: { status: { not: "DISABLED" } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, intouchFeeEarnerName: true },
    }),
    db.monthlySnapshot.findMany({ where: { year, month } }),
    db.completedMatter.findMany({
      where: { completionDate: { gte: start, lt: end } },
      orderBy: { completionDate: "asc" },
      select: { id: true, userId: true, address: true, postcode: true, handlerName: true, completionDate: true },
    }),
    getSettings(),
  ]);

  type MatterRow = { id: string; address: string; postcode: string | null; completionDate: string };
  const mattersByUser = new Map<string, MatterRow[]>();
  const unmatched: (MatterRow & { handlerName: string | null })[] = [];
  for (const m of monthCompletions) {
    const row = { id: m.id, address: m.address, postcode: m.postcode, completionDate: m.completionDate.toISOString() };
    if (!m.userId) {
      unmatched.push({ ...row, handlerName: m.handlerName });
      continue;
    }
    const list = mattersByUser.get(m.userId) ?? [];
    list.push(row);
    mattersByUser.set(m.userId, list);
  }

  const snapshotByUser = new Map(snapshots.map((s) => [s.userId, s.fileCountAtStart]));

  const rows = users
    .filter((u) => u.intouchFeeEarnerName) // only people actually tracked for commission
    .map((u) => {
      const fileCountAtStart = snapshotByUser.get(u.id) ?? null;
      const matters = mattersByUser.get(u.id) ?? [];
      const completions = matters.length;
      const calc = calculateCommission({
        fileCountAtStart,
        completions,
        commissionPerMatterPence: settings.commissionPerMatterPence,
        bonusUpliftPercent: settings.bonusUpliftPercent,
        bonusThresholdNumerator: settings.bonusThresholdNumerator,
        bonusThresholdDenominator: settings.bonusThresholdDenominator,
      });
      return { userId: u.id, name: u.name ?? u.email, email: u.email, fileCountAtStart, completions, matters, calc };
    });

  const totalOwedPence = rows.reduce((sum, r) => sum + r.calc.totalPence, 0);

  return NextResponse.json({ rows, totalOwedPence, unmatchedCount: unmatched.length, unmatched });
}
