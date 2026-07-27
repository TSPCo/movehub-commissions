import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateToken } from "@/lib/auth";
import { INVITE_TTL_MS } from "@/lib/tokens";
import { getAppUrl } from "@/lib/url";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const existing = await db.user.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.status !== "INVITED") {
    return NextResponse.json({ error: "This account has already been set up" }, { status: 400 });
  }

  const inviteToken = generateToken();
  await db.user.update({
    where: { id },
    data: { inviteToken, inviteTokenExpiry: new Date(Date.now() + INVITE_TTL_MS) },
  });

  const inviteUrl = new URL(`/invite/${inviteToken}`, getAppUrl(request)).toString();

  return NextResponse.json({ inviteUrl });
}
