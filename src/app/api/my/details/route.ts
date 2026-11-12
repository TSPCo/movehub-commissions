import { handleGet, handlePut } from "@/lib/staffDetailsApi";

export async function GET() {
  return handleGet(null);
}

export async function PUT(request: Request) {
  return handlePut(null, await request.json().catch(() => null));
}
