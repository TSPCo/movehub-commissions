import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { bankDetailsChangedEmail } from "@/lib/emailTemplates";
import type { BankDetails } from "@/lib/bankMatch";

// AES-256-GCM. Stored as "v1:<iv>:<tag>:<ciphertext>" (base64), so the format
// can change later without guessing. BANK_DETAILS_KEY is 32 random bytes,
// base64-encoded: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
// Losing or changing the key makes saved details unreadable (staff re-enter them) —
// it is NOT derived from SESSION_SECRET so rotating that doesn't wipe bank details.
const VERSION = "v1";

export class BankDetailsUnavailableError extends Error {}

function getKey() {
  const raw = process.env.BANK_DETAILS_KEY?.trim();
  if (!raw) throw new BankDetailsUnavailableError("BANK_DETAILS_KEY is not set");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new BankDetailsUnavailableError("BANK_DETAILS_KEY must be 32 bytes, base64-encoded");
  return key;
}

export const bankDetailsConfigured = () => {
  try {
    getKey();
    return true;
  } catch {
    return false;
  }
};

export function encryptBankDetails(details: BankDetails): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(details), "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64"), cipher.getAuthTag().toString("base64"), ciphertext.toString("base64")].join(":");
}

export function decryptBankDetails(blob: string): BankDetails {
  const [version, iv, tag, ciphertext] = blob.split(":");
  if (version !== VERSION || !iv || !tag || !ciphertext) throw new Error("Unrecognised bank details format");
  const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  const plain = Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64")), decipher.final()]);
  return JSON.parse(plain.toString("utf8")) as BankDetails;
}

/** Decrypted details for a user, or null if none saved. Throws if the key is missing/wrong. */
export async function getBankDetails(userId: string) {
  const row = await db.staffBankDetails.findUnique({ where: { userId } });
  if (!row) return null;
  return {
    details: decryptBankDetails(row.encrypted),
    lastChangedAt: row.lastChangedAt,
    updatedAt: row.updatedAt,
    accountNumberLast4: row.accountNumberLast4,
  };
}

/**
 * Saves someone's details. Any change (by them or an admin) emails the owner
 * and every active admin — if someone else has got into an account and swapped
 * the details, that's how it gets noticed before a payment goes out.
 */
export async function saveBankDetails(opts: { userId: string; details: BankDetails; editedById: string }) {
  const { userId, details, editedById } = opts;
  const existing = await db.staffBankDetails.findUnique({ where: { userId } });

  if (existing) {
    try {
      const current = decryptBankDetails(existing.encrypted);
      if (
        current.accountName === details.accountName &&
        current.sortCode === details.sortCode &&
        current.accountNumber === details.accountNumber
      ) {
        return { changed: false };
      }
    } catch {
      // Unreadable (e.g. key rotated) — treat as a change and overwrite.
    }
  }

  const now = new Date();
  const data = {
    encrypted: encryptBankDetails(details),
    accountNumberLast4: details.accountNumber.slice(-4),
    updatedById: editedById,
    ...(existing ? { lastChangedAt: now } : {}),
  };
  await db.staffBankDetails.upsert({ where: { userId }, create: { userId, ...data }, update: data });

  const [owner, editor, admins] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { name: true, email: true } }),
    db.user.findUnique({ where: { id: editedById }, select: { name: true, email: true } }),
    db.user.findMany({ where: { role: "ADMIN", status: "ACTIVE" }, select: { email: true } }),
  ]);
  if (owner) {
    const email = bankDetailsChangedEmail({
      ownerName: owner.name ?? owner.email,
      editorName: editedById === userId ? null : editor?.name ?? editor?.email ?? "an admin",
      firstTime: !existing,
      accountLast4: details.accountNumber.slice(-4),
      at: now,
    });
    const recipients = new Set([owner.email, ...admins.map((a) => a.email)]);
    await Promise.all([...recipients].map((to) => sendEmail({ to, ...email }).catch((err) => console.error("[bank] alert email failed", err))));
  }

  return { changed: true };
}
