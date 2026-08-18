import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isIntouchConfigured, findFeeEarnerNamesForTeam, IntouchApiError } from "@/lib/intouch";

/**
 * Derives a team-name fragment from a team inbox address, e.g.
 * "teamfenchurch@move-hub.co.uk" -> "fenchurch". Only addresses that
 * actually start with "team" have a fragment to look up (not admin@,
 * accounts@, etc.) — those aren't fee-earning staff.
 */
function teamFragmentFromEmail(email: string): string | null {
  const localPart = email.split("@")[0]?.toLowerCase() ?? "";
  if (!localPart.startsWith("team") || localPart.length <= 4) return null;
  return localPart.slice(4);
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isIntouchConfigured()) {
    return NextResponse.json({ error: "INTOUCH_API_KEY is not configured" }, { status: 503 });
  }

  const { id } = await params;
  const user = await db.user.findUnique({ where: { id }, select: { email: true } });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const fragment = teamFragmentFromEmail(user.email);
  if (!fragment) {
    return NextResponse.json({ error: `"${user.email}" doesn't look like a team inbox — nothing to look up.` }, { status: 400 });
  }

  try {
    const names = await findFeeEarnerNamesForTeam(fragment);
    return NextResponse.json({ names });
  } catch (err) {
    if (err instanceof IntouchApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
