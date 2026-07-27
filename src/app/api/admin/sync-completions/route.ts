import { NextResponse } from "next/server";
import { runCompletionSync } from "@/lib/completionSync";
import { IntouchApiError } from "@/lib/intouch";
import { isIntouchConfigured } from "@/lib/intouch";

/** Manual "Sync now" trigger for the admin page — same logic as the cron route, session-protected instead of CRON_SECRET-protected (proxy.ts already requires admin role for /api/admin/*). */
export async function POST() {
  if (!isIntouchConfigured()) {
    return NextResponse.json({ error: "INTOUCH_API_KEY is not configured" }, { status: 503 });
  }

  try {
    const summary = await runCompletionSync();
    return NextResponse.json(summary);
  } catch (err) {
    if (err instanceof IntouchApiError && err.status === 429) {
      return NextResponse.json({ error: "InTouch rate limit hit — try again in a minute." }, { status: 429 });
    }
    const message = err instanceof Error ? err.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
