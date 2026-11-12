import { handleGet, handlePut } from "@/lib/staffDetailsApi";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleGet(id);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handlePut(id, await request.json().catch(() => null));
}
