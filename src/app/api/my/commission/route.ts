import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { monthRange } from "@/lib/date";
import { calculateCommission } from "@/lib/commission";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const year = Number(request.nextUrl.searchParams.get("year"));
  const month = Number(request.nextUrl.searchParams.get("month"));
  if (!year || !month) {
    return NextResponse.json({ error: "year and month query params are required" }, { status: 400 });
  }

  const { start, end } = monthRange(year, month);

  const [snapshot, completions, settings] = await Promise.all([
    db.monthlySnapshot.findUnique({ where: { userId_year_month: { userId: session.sub, year, month } } }),
    db.completedMatter.findMany({
      where: { userId: session.sub, completionDate: { gte: start, lt: end } },
      orderBy: { completionDate: "asc" },
      select: { id: true, address: true, postcode: true, completionDate: true },
    }),
    getSettings(),
  ]);

  const calc = calculateCommission({
    fileCountAtStart: snapshot?.fileCountAtStart ?? null,
    completions: completions.length,
    commissionPerMatterPence: settings.commissionPerMatterPence,
    bonusUpliftPercent: settings.bonusUpliftPercent,
    bonusThresholdNumerator: settings.bonusThresholdNumerator,
    bonusThresholdDenominator: settings.bonusThresholdDenominator,
  });

  return NextResponse.json({
    fileCountAtStart: snapshot?.fileCountAtStart ?? null,
    completions: completions.map((c) => ({ ...c, completionDate: c.completionDate.toISOString() })),
    calc,
    commissionPerMatterPence: settings.commissionPerMatterPence,
    bonusUpliftPercent: settings.bonusUpliftPercent,
  });
}
