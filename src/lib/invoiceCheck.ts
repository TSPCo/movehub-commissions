import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { formatPence } from "@/lib/money";
import { matchAddress, formatPostcode, type AddressMatch } from "@/lib/addressMatch";
import { getBankDetails } from "@/lib/bankDetails";
import { bankCheckFlags, compareBankDetails, type BankCheck } from "@/lib/bankMatch";

const EXTRACTION_MODEL = "claude-sonnet-5-5";

const EXTRACTION_PROMPT = `You are reading an invoice a staff member has submitted for commission on completed property sales.
Extract every property listed, the invoice total, and the bank details the invoice asks to be paid into.

Return ONLY valid JSON (no markdown) in this shape, using null for anything not present:

{
  "totalAmount": numeric invoice total in pounds including any VAT, no currency symbols,
  "lines": [
    { "address": "full property address as written, excluding the postcode", "postcode": "postcode or null", "amount": numeric line amount in pounds or null }
  ],
  "bankDetails": {
    "accountName": "name on the bank account as written, or null",
    "sortCode": "sort code exactly as written, or null",
    "accountNumber": "account number exactly as written, or null"
  }
}

Copy bank numbers exactly as written — never guess or fill in missing digits. If there are no bank details, set "bankDetails" to null.
If the document is not an invoice or lists no properties, return {"totalAmount": null, "lines": [], "bankDetails": null}.`;

export interface InvoiceLineCheck {
  address: string;
  postcode: string | null;
  amountPence: number | null;
  outcome: "MATCHED" | "ALREADY_INVOICED" | "OTHER_STAFF" | "NOT_FOUND";
  matterId?: string;
  matchedAddress?: string;
  completionDate?: string;
  matchedOwner?: string | null;
}

export interface InvoiceCheckResult {
  invoiceTotalPence: number | null;
  enteredAmountPence: number;
  lines: InvoiceLineCheck[];
  matchedMatterIds: string[];
  expectedBasePence: number;
  expectedMaxPence: number;
  /** Completions this person has that aren't on this or any other of their invoices. */
  uninvoicedCompletions: { id: string; address: string; postcode: string | null; completionDate: string }[];
  /** Missing on checks run before bank details existed, or when BANK_DETAILS_KEY isn't set. */
  bank?: BankCheck & { changedSinceLastPaymentAt: string | null };
  flags: string[];
}

export class InvoiceCheckUnavailableError extends Error {}

export interface Extraction {
  totalAmount: number | null;
  lines: { address: string; postcode: string | null; amount: number | null }[];
  bankDetails?: { accountName: string | null; sortCode: string | null; accountNumber: string | null } | null;
}

const toPence = (pounds: number | null | undefined) =>
  typeof pounds === "number" && Number.isFinite(pounds) ? Math.round(pounds * 100) : null;

export async function extractInvoice(fileData: Buffer, mimeType: string): Promise<Extraction | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new InvoiceCheckUnavailableError("ANTHROPIC_API_KEY is not configured");

  const data = fileData.toString("base64");
  const fileBlock =
    mimeType === "application/pdf"
      ? ({ type: "document", source: { type: "base64", media_type: "application/pdf", data } } as const)
      : ({
          type: "image",
          source: { type: "base64", media_type: mimeType as "image/png" | "image/jpeg", data },
        } as const);

  const anthropic = new Anthropic({ apiKey });
  const response = await anthropic.messages.create({
    model: EXTRACTION_MODEL,
    max_tokens: 2048,
    messages: [{ role: "user", content: [fileBlock, { type: "text", text: EXTRACTION_PROMPT }] }],
  });

  const text = response.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const json = text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed?.lines)) return null;
    return parsed as Extraction;
  } catch {
    return null;
  }
}

/**
 * Reads an uploaded invoice and checks it against InTouch completion data:
 * every property listed must be a completion attributed to this person (not
 * someone else's, not one already claimed on another of their invoices), the
 * total must match what was entered, and must be plausible for the number of
 * matched properties. Advisory only — the result is stored on the invoice for
 * an admin to review, it never blocks anything.
 */
export async function runInvoiceCheck(invoiceId: string): Promise<void> {
  const invoice = await db.staffInvoice.findUnique({ where: { id: invoiceId } });
  if (!invoice || !invoice.userId) return;

  let extraction: Extraction | null;
  try {
    extraction = await extractInvoice(Buffer.from(invoice.fileData), invoice.fileMimeType);
  } catch (err) {
    if (err instanceof InvoiceCheckUnavailableError) return; // stays NOT_CHECKED
    // A rejected/revoked key or an Anthropic outage says nothing about the invoice —
    // leave it NOT_CHECKED (re-check later) rather than calling it unreadable.
    if (err instanceof Anthropic.APIError) {
      console.error("Invoice check couldn't reach the AI reader", invoiceId, err.status);
      return;
    }
    console.error("Invoice check failed to read file", invoiceId, err);
    extraction = null;
  }

  if (!extraction || extraction.lines.length === 0) {
    await db.staffInvoice.update({
      where: { id: invoiceId },
      data: {
        checkStatus: "UNREADABLE",
        checkedAt: new Date(),
        checkResult: { flags: ["Couldn't find any properties listed on this invoice — check it manually."] },
      },
    });
    return;
  }

  const [completions, otherInvoices, bonuses, settings] = await Promise.all([
    db.completedMatter.findMany({
      select: {
        id: true,
        userId: true,
        address: true,
        postcode: true,
        handlerName: true,
        completionDate: true,
        user: { select: { name: true } },
      },
    }),
    db.staffInvoice.findMany({
      where: { userId: invoice.userId, id: { not: invoice.id } },
      select: { checkResult: true },
    }),
    db.bonusPayment.aggregate({ where: { userId: invoice.userId }, _sum: { amountPence: true } }),
    getSettings(),
  ]);

  const claimedElsewhere = new Set<string>();
  for (const other of otherInvoices) {
    const ids = (other.checkResult as { matchedMatterIds?: string[] } | null)?.matchedMatterIds;
    ids?.forEach((id) => claimedElsewhere.add(id));
  }

  const postcodeFlags: string[] = [];
  const lines: InvoiceLineCheck[] = extraction.lines.map((line) => {
    const base = { address: line.address, postcode: line.postcode, amountPence: toPence(line.amount) };
    // Exact postcode matches first, so a one-character postcode slip never beats a real match.
    const scored = completions
      .map((c) => ({ c, match: matchAddress(line, c) }))
      .filter((x): x is { c: (typeof completions)[number]; match: AddressMatch } => x.match !== null)
      .sort((a, b) => Number(b.match.kind === "exact") - Number(a.match.kind === "exact"));
    const candidates = scored.map((x) => x.c);
    const ownScored = scored.find((x) => x.c.userId === invoice.userId);
    const own = ownScored?.c;
    if (own && ownScored) {
      if (ownScored.match.kind === "postcode-differs") {
        postcodeFlags.push(
          `${line.address}: the postcode on the invoice (${formatPostcode(ownScored.match.invoicePostcode)}) differs from InTouch (${formatPostcode(ownScored.match.matterPostcode)}) — check which is right.`
        );
      }
      return {
        ...base,
        outcome: claimedElsewhere.has(own.id) ? "ALREADY_INVOICED" : "MATCHED",
        matterId: own.id,
        matchedAddress: [own.address, own.postcode].filter(Boolean).join(", "),
        completionDate: own.completionDate.toISOString(),
      };
    }
    const theirs = candidates[0];
    if (theirs) {
      return {
        ...base,
        outcome: "OTHER_STAFF",
        matterId: theirs.id,
        matchedAddress: [theirs.address, theirs.postcode].filter(Boolean).join(", "),
        completionDate: theirs.completionDate.toISOString(),
        matchedOwner: theirs.user?.name ?? theirs.handlerName,
      };
    }
    return { ...base, outcome: "NOT_FOUND" };
  });

  const matchedMatterIds = [...new Set(lines.filter((l) => l.outcome === "MATCHED").map((l) => l.matterId!))];
  const invoicedIds = new Set([...matchedMatterIds, ...claimedElsewhere]);
  const uninvoicedCompletions = completions
    .filter((c) => c.userId === invoice.userId && !invoicedIds.has(c.id))
    .map((c) => ({ id: c.id, address: c.address, postcode: c.postcode, completionDate: c.completionDate.toISOString() }));

  const invoiceTotalPence = toPence(extraction.totalAmount);
  const expectedBasePence = matchedMatterIds.length * settings.commissionPerMatterPence;
  const expectedMaxPence =
    Math.round(expectedBasePence * (1 + settings.bonusUpliftPercent / 100)) + (bonuses._sum.amountPence ?? 0);

  const flags: string[] = [];
  const problemLines = (outcome: InvoiceLineCheck["outcome"]) => lines.filter((l) => l.outcome === outcome);

  for (const l of problemLines("NOT_FOUND")) {
    flags.push(`${l.address}${l.postcode ? `, ${l.postcode}` : ""} has no completion on record (not completed in InTouch yet, or the completions sync hasn't picked it up).`);
  }
  for (const l of problemLines("OTHER_STAFF")) {
    flags.push(`${l.address} completed under ${l.matchedOwner ?? "someone else / unattributed"}, not this person.`);
  }
  for (const l of problemLines("ALREADY_INVOICED")) {
    flags.push(`${l.address} was already listed on another of their invoices.`);
  }
  flags.push(...postcodeFlags);
  const lineAddresses = lines.filter((l) => l.outcome === "MATCHED").map((l) => l.matterId);
  if (new Set(lineAddresses).size < lineAddresses.length) {
    flags.push("The same property appears more than once on this invoice.");
  }
  if (invoiceTotalPence == null) {
    flags.push("Couldn't read a total from the invoice.");
  } else {
    if (Math.abs(invoiceTotalPence - invoice.amountPence) > 1) {
      flags.push(`Invoice total ${formatPence(invoiceTotalPence)} doesn't match the amount entered (${formatPence(invoice.amountPence)}).`);
    }
    if (invoiceTotalPence > expectedMaxPence) {
      flags.push(
        `Invoice total ${formatPence(invoiceTotalPence)} is more than the ${formatPence(expectedMaxPence)} expected for ${matchedMatterIds.length} verified completion${matchedMatterIds.length === 1 ? "" : "s"} (including possible bonus uplift and ad-hoc bonuses).`
      );
    }
  }

  const bank = await checkBankDetails(invoice, extraction.bankDetails ?? null);
  if (bank) flags.push(...bankCheckFlags(bank, bank.changedSinceLastPaymentAt ? new Date(bank.changedSinceLastPaymentAt) : null));

  const result: InvoiceCheckResult = {
    invoiceTotalPence,
    enteredAmountPence: invoice.amountPence,
    lines,
    matchedMatterIds,
    expectedBasePence,
    expectedMaxPence,
    uninvoicedCompletions,
    ...(bank ? { bank } : {}),
    flags,
  };

  await db.staffInvoice.update({
    where: { id: invoiceId },
    data: { checkStatus: flags.length ? "FLAGGED" : "PASSED", checkResult: result as object, checkedAt: new Date() },
  });
}

/**
 * Compares the invoice's bank details with the ones saved for its owner, and
 * notes if those saved details changed since the owner was last paid. Returns
 * null (skipping the bank part of the check, not failing it) if saved details
 * can't be read — e.g. BANK_DETAILS_KEY isn't set.
 */
async function checkBankDetails(
  invoice: { id: string; userId: string | null },
  fromInvoice: Extraction["bankDetails"] | null
): Promise<InvoiceCheckResult["bank"] | null> {
  if (!invoice.userId) return null;
  let saved: Awaited<ReturnType<typeof getBankDetails>>;
  try {
    saved = await getBankDetails(invoice.userId);
  } catch (err) {
    console.error("Invoice check skipped bank details", invoice.id, err instanceof Error ? err.message : err);
    return null;
  }

  const check = compareBankDetails(saved?.details ?? null, fromInvoice ?? null);

  let changedSinceLastPaymentAt: string | null = null;
  if (saved?.lastChangedAt) {
    const lastPaid = await db.staffInvoice.findFirst({
      where: { userId: invoice.userId, id: { not: invoice.id }, status: "PAID", paidAt: { not: null } },
      orderBy: { paidAt: "desc" },
      select: { paidAt: true },
    });
    if (!lastPaid?.paidAt || saved.lastChangedAt > lastPaid.paidAt) changedSinceLastPaymentAt = saved.lastChangedAt.toISOString();
  }

  return { ...check, changedSinceLastPaymentAt };
}
