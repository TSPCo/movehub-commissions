import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";

export async function GET() {
  const settings = await getSettings();
  return NextResponse.json({ settings });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const settings = await db.settings.update({
    where: { id: "singleton" },
    data: {
      commissionPerMatterPence: typeof body.commissionPerMatterPence === "number" ? body.commissionPerMatterPence : undefined,
      bonusUpliftPercent: typeof body.bonusUpliftPercent === "number" ? body.bonusUpliftPercent : undefined,
      bonusThresholdNumerator: typeof body.bonusThresholdNumerator === "number" ? body.bonusThresholdNumerator : undefined,
      bonusThresholdDenominator: typeof body.bonusThresholdDenominator === "number" ? body.bonusThresholdDenominator : undefined,
      intouchSyncSinceDate:
        body.intouchSyncSinceDate === null
          ? null
          : typeof body.intouchSyncSinceDate === "string" && body.intouchSyncSinceDate
            ? new Date(body.intouchSyncSinceDate)
            : undefined,
    },
  });

  return NextResponse.json({ settings });
}
