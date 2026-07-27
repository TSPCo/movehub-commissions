import { NextRequest, NextResponse } from "next/server";
import { runMonthlySnapshot } from "@/lib/monthlySnapshot";
import { IntouchApiError } from "@/lib/intouch";
import { isIntouchConfigured } from "@/lib/intouch";

/**
 * Manual snapshot trigger for the admin page — e.g. to take this month's
 * snapshot right now instead of waiting for the scheduled cron, or to
 * `force` retake it if a previous one was wrong. Session-protected
 * (proxy.ts already requires admin role for /api/admin/*).
 */
export async function POST(request: NextRequest) {
  if (!isIntouchConfigured()) {
    return NextResponse.json({ error: "INTOUCH_API_KEY is not configured" }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const force = body?.force === true;

  try {
    const summary = await runMonthlySnapshot({ force });
    return NextResponse.json(summary);
  } catch (err) {
    if (err instanceof IntouchApiError && err.status === 429) {
      return NextResponse.json({ error: "InTouch rate limit hit — try again in a minute." }, { status: 429 });
    }
    const message = err instanceof Error ? err.message : "Snapshot failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
