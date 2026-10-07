import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

/** Admin records an ad-hoc bonus owed to a staff member (proxy.ts already requires admin for /api/admin/*). */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const userId = body?.userId;
  const amountPence = Math.round(Number(body?.amountPence));
  const note = typeof body?.note === "string" ? body.note.trim() : "";

  if (typeof userId !== "string" || !userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }
  if (!Number.isFinite(amountPence) || amountPence <= 0) {
    return NextResponse.json({ error: "A valid amount is required" }, { status: 400 });
  }
  if (!note) {
    return NextResponse.json({ error: "A short note is required (e.g. what the bonus was for)" }, { status: 400 });
  }

  const target = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!target) return NextResponse.json({ error: "Staff member not found" }, { status: 404 });

  const bonus = await db.bonusPayment.create({
    data: { userId, recordedById: session.sub, amountPence, note },
  });

  return NextResponse.json(
    { bonus: { id: bonus.id, amountPence: bonus.amountPence, note: bonus.note, awardedAt: bonus.awardedAt.toISOString() } },
    { status: 201 }
  );
}
