import { NextRequest } from "next/server";
import { handleGet, handlePut } from "@/lib/bankDetailsApi";

export async function GET(request: NextRequest) {
  return handleGet(null, request.nextUrl.searchParams.get("reveal") === "1");
}

export async function PUT(request: NextRequest) {
  return handlePut(null, await request.json().catch(() => null));
}
