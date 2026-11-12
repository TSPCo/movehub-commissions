import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { fetchSalesProgressionCapacities, pushCapacity } from "@/lib/capacitySync";

/**
 * Admin-only (proxy.ts guards /api/admin/*).
 *  - action "import": one-off seed — copy Sales Progression's current capacity
 *    figures into anyone here who hasn't set a max open cases yet. Never
 *    overwrites a figure already held here.
 *  - action "push-all": re-send every saved figure to Sales Progression (e.g.
 *    after it was offline, or once the link is first switched on).
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { action } = (await request.json().catch(() => ({}))) as { action?: string };

  if (action === "import") {
    let remote;
    try {
      remote = await fetchSalesProgressionCapacities();
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't reach Sales Progression" }, { status: 502 });
    }
    const users = await db.user.findMany({ select: { id: true, email: true, staffDetails: { select: { maxOpenCases: true } } } });
    const byEmail = new Map(users.map((u) => [u.email.toLowerCase(), u]));

    let imported = 0;
    let alreadySet = 0;
    const notFound: string[] = [];
    for (const r of remote) {
      if (r.capacity == null) continue;
      const u = byEmail.get(r.email.toLowerCase());
      if (!u) {
        notFound.push(r.email);
        continue;
      }
      if (u.staffDetails?.maxOpenCases != null) {
        alreadySet++;
        continue;
      }
      await db.$transaction([
        db.staffDetails.upsert({
          where: { userId: u.id },
          create: { userId: u.id, maxOpenCases: r.capacity, updatedById: session.sub, capacitySyncedAt: new Date() },
          update: { maxOpenCases: r.capacity, updatedById: session.sub, capacitySyncedAt: new Date(), capacitySyncError: null },
        }),
        db.capacityChange.create({ data: { userId: u.id, fromValue: null, toValue: r.capacity, changedById: session.sub } }),
      ]);
      imported++;
    }
    return NextResponse.json({ imported, alreadySet, notFound });
  }

  if (action === "push-all") {
    const rows = await db.staffDetails.findMany({ select: { userId: true, user: { select: { email: true } } } });
    const failed: { email: string; error: string }[] = [];
    for (const r of rows) {
      const res = await pushCapacity(r.userId);
      if (!res.ok) failed.push({ email: r.user.email, error: res.error });
    }
    return NextResponse.json({ pushed: rows.length - failed.length, failed });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
