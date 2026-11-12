"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, FileText } from "lucide-react";
import { formatPence } from "@/lib/money";
import type { Invoice } from "@/components/selfBilling/shared";

/** Accepted self-billed invoices (and credit notes) waiting to be paid — due 10 days after acceptance. */
export function SelfBilledPayments() {
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [bankChanged, setBankChanged] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/self-billing", { cache: "no-store" });
    const body = await res.json();
    if (!res.ok) return setError(body.error || "Couldn't load self-billed invoices");
    setInvoices(body.invoices);
    setBankChanged(body.bankChangedUserIds);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/self-billing", { cache: "no-store" })
      .then(async (r) => ({ ok: r.ok, body: await r.json() }))
      .then(({ ok, body }) => {
        if (cancelled) return;
        if (!ok) return setError(body.error || "Couldn't load self-billed invoices");
        setInvoices(body.invoices);
        setBankChanged(body.bankChangedUserIds);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function setPaid(id: string, paid: boolean) {
    setError(null);
    const res = await fetch(`/api/admin/self-billing/invoices/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: paid ? "paid" : "unpaid" }) });
    const body = await res.json();
    if (!res.ok) setError(body.error || "Something went wrong");
    await load();
  }

  if (!invoices) return error ? <p className="mb-6 text-sm" style={{ color: "var(--danger)" }}>{error}</p> : null;
  const due = invoices.filter((i) => i.kind === "INVOICE" && i.status === "ACCEPTED").sort((a, b) => (a.acceptedAt ?? "").localeCompare(b.acceptedAt ?? ""));
  const recentlyPaid = invoices.filter((i) => i.kind === "INVOICE" && i.status === "PAID").sort((a, b) => (b.paidAt ?? "").localeCompare(a.paidAt ?? "")).slice(0, 5);
  if (due.length === 0 && recentlyPaid.length === 0) return null;

  return (
    <section className="mb-8 space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-white">Self-billed invoices to pay ({due.length})</h2>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>Due 10 days after acceptance. Pay the total shown (net plus any VAT). Credit notes aren't listed here — they're taken off what that person is owed automatically.</p>
      </div>
      {error && <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              {["Invoice", "Progressor", "Period", "Total", "Accepted", "Due", ""].map((h) => (
                <th key={h} className="px-4 py-2 text-left text-xs font-medium" style={{ color: "var(--text-muted)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {due.map((i) => (
              <tr key={i.id} style={{ borderBottom: "1px solid var(--border)" }}>
                <td className="px-4 py-2">
                  <a href={`/api/admin/self-billing/invoices/${i.id}/pdf`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium" style={{ color: "var(--cyan)" }}>
                    <FileText className="h-3.5 w-3.5" />{i.number}
                  </a>
                </td>
                <td className="px-4 py-2" style={{ color: "var(--text-secondary)" }}>
                  {i.user?.name ?? "—"}
                  {i.user && bankChanged.includes(i.user.id) && (
                    <span className="mt-0.5 flex items-center gap-1 text-xs" style={{ color: "var(--warning)" }}>
                      <AlertTriangle className="h-3 w-3" /> Bank details changed since their last payment — confirm by phone first
                    </span>
                  )}
                </td>
                <td className="px-4 py-2" style={{ color: "var(--text-secondary)" }}>{i.period}</td>
                <td className="px-4 py-2 font-medium">{formatPence(i.grossPence)}</td>
                <td className="px-4 py-2 text-xs" style={{ color: "var(--text-muted)" }}>{new Date(i.acceptedAt!).toLocaleDateString("en-GB")}{i.acceptedHow === "DEEMED" ? " (deemed)" : ""}</td>
                <td className="px-4 py-2 text-xs" style={{ color: i.paymentOverdue ? "var(--danger)" : "var(--text-secondary)" }}>{`${i.paymentDue}${i.paymentOverdue ? " (overdue)" : ""}`}</td>
                <td className="px-4 py-2 text-right">
                  <button onClick={() => setPaid(i.id, true)} className="btn-secondary px-3 py-1 text-xs">Mark paid</button>
                </td>
              </tr>
            ))}
            {due.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-3 text-xs" style={{ color: "var(--text-muted)" }}>Nothing due.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {recentlyPaid.length > 0 && (
        <details className="text-xs" style={{ color: "var(--text-muted)" }}>
          <summary className="cursor-pointer">Recently paid</summary>
          <ul className="mt-2 space-y-1">
            {recentlyPaid.map((i) => (
              <li key={i.id} className="flex gap-3">
                <span>{i.number} · {i.user?.name} · {formatPence(i.grossPence)} · paid {new Date(i.paidAt!).toLocaleDateString("en-GB")}</span>
                <button onClick={() => setPaid(i.id, false)} style={{ color: "var(--text-muted)" }} className="underline">undo</button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
