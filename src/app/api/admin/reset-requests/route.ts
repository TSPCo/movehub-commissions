import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const requests = await db.passwordResetRequest.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  return NextResponse.json({ requests });
}
