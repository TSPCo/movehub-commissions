import { NextRequest } from "next/server";
import { handleGet, handlePut } from "@/lib/bankDetailsApi";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleGet(id, request.nextUrl.searchParams.get("reveal") === "1");
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handlePut(id, await request.json().catch(() => null));
}
