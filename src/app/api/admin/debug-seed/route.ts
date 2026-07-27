import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * TEMPORARY — for seeding demo data on a test account so the bonus UI can be
 * previewed with realistic numbers. Remove this route once done; it's not
 * meant to ship long-term (direct, unaudited DB writes from a request body).
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const { userId, year, month, fileCountAtStart, completions } = body ?? {};
  if (!userId || !year || !month || typeof fileCountAtStart !== "number" || typeof completions !== "number") {
    return NextResponse.json({ error: "userId, year, month, fileCountAtStart, completions are required" }, { status: 400 });
  }

  await db.monthlySnapshot.upsert({
    where: { userId_year_month: { userId, year, month } },
    update: { fileCountAtStart },
    create: { userId, year, month, fileCountAtStart },
  });

  await db.completedMatter.deleteMany({ where: { userId, intouchGuid: { startsWith: "demo-" } } });

  const data = Array.from({ length: completions }, (_, i) => ({
    userId,
    intouchGuid: `demo-${i + 1}`,
    address: `${i + 1} Demo Street`,
    postcode: "TE1 1ST",
    handlerName: "Mat",
    completionDate: new Date(Date.UTC(year, month - 1, (i % 27) + 1, 10, 0, 0)),
  }));

  await db.completedMatter.createMany({ data });

  return NextResponse.json({ ok: true, snapshot: fileCountAtStart, completions: data.length });
}
