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

  const [users, snapshots, completionCounts, settings, unmatchedCount] = await Promise.all([
    db.user.findMany({
      where: { status: { not: "DISABLED" } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, intouchFeeEarnerName: true },
    }),
    db.monthlySnapshot.findMany({ where: { year, month } }),
    db.completedMatter.groupBy({
      by: ["userId"],
      where: { completionDate: { gte: start, lt: end }, userId: { not: null } },
      _count: { _all: true },
    }),
    getSettings(),
    db.completedMatter.count({
      where: { completionDate: { gte: start, lt: end }, userId: null },
    }),
  ]);

  const snapshotByUser = new Map(snapshots.map((s) => [s.userId, s.fileCountAtStart]));
  const completionsByUser = new Map(completionCounts.map((c) => [c.userId, c._count._all]));

  const rows = users
    .filter((u) => u.intouchFeeEarnerName) // only people actually tracked for commission
    .map((u) => {
      const fileCountAtStart = snapshotByUser.get(u.id) ?? null;
      const completions = completionsByUser.get(u.id) ?? 0;
      const calc = calculateCommission({
        fileCountAtStart,
        completions,
        commissionPerMatterPence: settings.commissionPerMatterPence,
        bonusUpliftPercent: settings.bonusUpliftPercent,
        bonusThresholdNumerator: settings.bonusThresholdNumerator,
        bonusThresholdDenominator: settings.bonusThresholdDenominator,
      });
      return { userId: u.id, name: u.name ?? u.email, email: u.email, fileCountAtStart, completions, calc };
    });

  const totalOwedPence = rows.reduce((sum, r) => sum + r.calc.totalPence, 0);

  return NextResponse.json({ rows, totalOwedPence, unmatchedCount });
}
