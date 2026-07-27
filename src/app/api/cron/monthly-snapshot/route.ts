import { NextRequest, NextResponse } from "next/server";
import { runMonthlySnapshot } from "@/lib/monthlySnapshot";
import { IntouchApiError } from "@/lib/intouch";

/**
 * Hit on a schedule by a Railway Cron Job — meant to run once shortly after
 * midnight on the 1st of each month. See runMonthlySnapshot() for why this
 * is safe to fire more than once in the same month (it no-ops on an existing
 * snapshot rather than overwriting it).
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  }

  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await runMonthlySnapshot();
    return NextResponse.json(summary);
  } catch (err) {
    if (err instanceof IntouchApiError && err.status === 429) {
      return NextResponse.json(
        { error: "InTouch rate limit exhausted (shared account) — will retry next scheduled run." },
        { status: 429 }
      );
    }
    const message = err instanceof Error ? err.message : "Snapshot failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
