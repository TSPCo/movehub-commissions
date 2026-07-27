import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/** Manually attribute an unmatched completed matter to a staff member (e.g. their InTouch name didn't match anyone's intouchFeeEarnerName). */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const userId = typeof body?.userId === "string" ? body.userId : null;
  if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

  const matter = await db.completedMatter.update({ where: { id }, data: { userId } });
  return NextResponse.json({ matter });
}
