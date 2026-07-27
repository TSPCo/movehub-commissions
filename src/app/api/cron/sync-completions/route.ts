import { NextRequest, NextResponse } from "next/server";
import { runCompletionSync } from "@/lib/completionSync";
import { IntouchApiError } from "@/lib/intouch";

/**
 * Hit on a schedule by a Railway Cron Job (or any external scheduler).
 * Authenticates via CRON_SECRET rather than the session cookie, since a cron
 * job has no browser session — proxy.ts excludes /api/cron/* from its normal
 * auth check specifically so this route can enforce its own.
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
    const summary = await runCompletionSync();
    return NextResponse.json(summary);
  } catch (err) {
    if (err instanceof IntouchApiError && err.status === 429) {
      return NextResponse.json(
        { error: "InTouch rate limit exhausted (shared account) — will retry next scheduled run." },
        { status: 429 }
      );
    }
    const message = err instanceof Error ? err.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
