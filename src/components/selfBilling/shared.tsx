"use client";

import { formatPence } from "@/lib/money";

export type Line = { id: string; type: string; description: string; amountPence: number; completionDate: string | null };

export type Invoice = {
  id: string;
  kind: "INVOICE" | "CREDIT_NOTE";
  status: "DRAFT" | "ISSUED" | "QUERIED" | "ACCEPTED" | "PAID" | "VOID";
  number: string | null;
  period: string;
  periodYear: number;
  periodMonth: number;
  user: { id: string; name: string; email: string } | null;
  netPence: number;
  vatPence: number;
  grossPence: number;
  vatRatePercent: number | null;
  warnings: string[];
  lines: Line[];
  issueDeadline: string;
  issueLate: boolean;
  issuedAt: string | null;
  queryBy: string | null;
  queriedAt: string | null;
  queryNote: string | null;
  queryResponse: string | null;
  acceptedAt: string | null;
  acceptedHow: "CONFIRMED" | "DEEMED" | null;
  paymentDue: string | null;
  paymentOverdue: boolean;
  paidAt: string | null;
  voidReason: string | null;
  originalNumber: string | null;
  replacesNumber: string | null;
  replacedBy: { id: string; number: string | null }[];
  hasPdf: boolean;
};

export type Agreement = {
  id: string;
  startDate: string;
  endDate: string;
  version: string;
  signedName: string;
  signedAt: string;
  moveHubSignatory: string;
  endedAt: string | null;
  endReason: string | null;
  text: string;
  state: "active" | "upcoming" | "ended";
};

export const fmtDay = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

const STATUS: Record<Invoice["status"], { label: string; color: string; bg: string }> = {
  DRAFT: { label: "Draft", color: "var(--text-secondary)", bg: "rgba(255,255,255,0.06)" },
  ISSUED: { label: "Awaiting acceptance", color: "var(--cyan)", bg: "rgba(0,212,255,0.1)" },
  QUERIED: { label: "Queried", color: "var(--warning)", bg: "rgba(245,158,11,0.12)" },
  ACCEPTED: { label: "Accepted", color: "var(--success)", bg: "rgba(34,197,94,0.12)" },
  PAID: { label: "Paid", color: "var(--success)", bg: "rgba(34,197,94,0.12)" },
  VOID: { label: "Void", color: "var(--text-muted)", bg: "rgba(255,255,255,0.04)" },
};

export function StatusPill({ inv }: { inv: Invoice }) {
  const s = STATUS[inv.status];
  const label = inv.status === "ACCEPTED" && inv.acceptedHow === "DEEMED" ? "Accepted (deemed)" : inv.status === "VOID" && inv.replacedBy.length ? "Replaced" : s.label;
  return (
    <span className="rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap" style={{ color: s.color, background: s.bg }}>
      {label}
    </span>
  );
}

export function LinesTable({ inv, onRemoveAdjustment }: { inv: Invoice; onRemoveAdjustment?: (lineId: string) => void }) {
  return (
    <table className="w-full text-xs">
      <tbody>
        {inv.lines.map((l) => (
          <tr key={l.id} style={{ borderBottom: "1px solid var(--border)" }}>
            <td className="py-1.5 pr-3" style={{ color: "var(--text-secondary)" }}>
              {l.description}
              {onRemoveAdjustment && l.type === "ADJUSTMENT" && (
                <button onClick={() => onRemoveAdjustment(l.id)} className="ml-2" style={{ color: "var(--danger)" }}>
                  remove
                </button>
              )}
            </td>
            <td className="py-1.5 pr-3 whitespace-nowrap" style={{ color: "var(--text-muted)" }}>{l.completionDate ? fmtDay(l.completionDate) : ""}</td>
            <td className="py-1.5 text-right font-medium whitespace-nowrap">{formatPence(l.amountPence)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        {inv.vatRatePercent != null && (
          <>
            <tr><td colSpan={2} className="pt-2 text-right" style={{ color: "var(--text-muted)" }}>Net</td><td className="pt-2 text-right">{formatPence(inv.netPence)}</td></tr>
            <tr><td colSpan={2} className="text-right" style={{ color: "var(--text-muted)" }}>VAT {inv.vatRatePercent}%</td><td className="text-right">{formatPence(inv.vatPence)}</td></tr>
          </>
        )}
        <tr>
          <td colSpan={2} className="pt-2 text-right font-semibold">Total</td>
          <td className="pt-2 text-right font-semibold text-white">{formatPence(inv.grossPence)}</td>
        </tr>
      </tfoot>
    </table>
  );
}
