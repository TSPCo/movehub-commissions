import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { authorise } from "@/lib/bankDetailsApi";
import { db } from "@/lib/db";
import { extractInvoice, InvoiceCheckUnavailableError } from "@/lib/invoiceCheck";
import { suggestFromInvoices, type InvoiceBankReading } from "@/lib/bankMatch";

// Reading each invoice takes a few seconds; this many in parallel, newest first, is plenty.
const MAX_INVOICES = 8;
const CONCURRENCY = 4;

/**
 * Admin-only: reads someone's stored invoices and suggests bank details to
 * pre-fill the form with. Saves nothing — the admin reviews and saves through
 * the normal path (which encrypts and sends the usual alert emails).
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorise(id);
  if ("error" in auth) return auth.error;
  if (auth.me.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const invoices = await db.staffInvoice.findMany({
    where: { userId: auth.userId },
    orderBy: [{ paidAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    take: MAX_INVOICES,
    select: { id: true, fileName: true, fileMimeType: true, fileData: true, createdAt: true, status: true },
  });
  if (invoices.length === 0) {
    return NextResponse.json({ error: "They haven't got any invoices stored yet." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  const readings: InvoiceBankReading[] = [];
  try {
    for (let i = 0; i < invoices.length; i += CONCURRENCY) {
      const batch = invoices.slice(i, i + CONCURRENCY);
      readings.push(
        ...(await Promise.all(
          batch.map(async (inv) => {
            let read: InvoiceBankReading["read"] = null;
            try {
              read = (await extractInvoice(Buffer.from(inv.fileData), inv.fileMimeType))?.bankDetails ?? null;
            } catch (err) {
              if (err instanceof InvoiceCheckUnavailableError || err instanceof Anthropic.APIError) throw err;
              console.error("[bank] couldn't read invoice for suggestion", inv.id, err);
            }
            return { invoiceId: inv.id, fileName: inv.fileName, createdAt: inv.createdAt, paid: inv.status === "PAID", read };
          })
        ))
      );
    }
  } catch (err) {
    console.error("[bank] AI reader unavailable for suggestion", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Couldn't reach the AI invoice reader — try again in a minute." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  return NextResponse.json(suggestFromInvoices(readings), { headers: { "Cache-Control": "no-store" } });
}
