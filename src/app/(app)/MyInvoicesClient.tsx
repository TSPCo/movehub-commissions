"use client";

import { useEffect, useState } from "react";
import { Download, Trash2 } from "lucide-react";
import { formatPence } from "@/lib/money";

type Invoice = {
  id: string;
  amountPence: number;
  fileName: string;
  status: "PENDING" | "PAID";
  paidAt: string | null;
  createdAt: string;
};

type InvoicesData = {
  lifetimeEarnedPence: number;
  totalPaidPence: number;
  outstandingPence: number;
  invoices: Invoice[];
};

export function MyInvoicesClient() {
  const [data, setData] = useState<InvoicesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    fetch("/api/my/invoices")
      .then((res) => res.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      });
  }

  useEffect(load, []);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setError(null);
    const form = new FormData();
    form.set("amountPence", String(Math.round(Number(amount) * 100)));
    form.set("file", file);
    const res = await fetch("/api/my/invoices", { method: "POST", body: form });
    const body = await res.json().catch(() => ({}));
    setUploading(false);
    if (!res.ok) {
      setError(body.error || "Upload failed");
      return;
    }
    setAmount("");
    setFile(null);
    load();
  }

  async function handleWithdraw(id: string) {
    if (!confirm("Withdraw this invoice? This can't be undone.")) return;
    setError(null);
    const res = await fetch(`/api/my/invoices/${id}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error || "Something went wrong");
      return;
    }
    load();
  }

  if (loading || !data) {
    return (
      <div className="card mt-6 p-4 text-sm" style={{ color: "var(--text-muted)" }}>
        Loading invoices…
      </div>
    );
  }

  return (
    <div className="mt-6">
      <h2 className="mb-3 text-sm font-semibold">My invoices</h2>

      <div className="mb-4 grid grid-cols-3 gap-4">
        <StatCard label="Earned to date" value={formatPence(data.lifetimeEarnedPence)} />
        <StatCard label="Paid" value={formatPence(data.totalPaidPence)} />
        <StatCard label="Outstanding" value={formatPence(data.outstandingPence)} accent />
      </div>

      <div className="card mb-4 p-5">
        <p className="mb-3 text-xs" style={{ color: "var(--text-muted)" }}>
          Submit an invoice for what&apos;s owed.
        </p>
        <form onSubmit={handleUpload} className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Amount</label>
            <input
              required
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-28 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Invoice file</label>
            <input
              required
              type="file"
              accept="application/pdf,image/png,image/jpeg"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-xs"
            />
          </div>
          <button type="submit" disabled={uploading} className="btn-primary px-4 py-2 text-sm">
            {uploading ? "Uploading…" : "Submit invoice"}
          </button>
        </form>
        {error && <p className="mt-2 text-xs" style={{ color: "var(--danger)" }}>{error}</p>}
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--text-secondary)" }}>Amount</th>
              <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--text-secondary)" }}>File</th>
              <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--text-secondary)" }}>Submitted</th>
              <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--text-secondary)" }}>Status</th>
              <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--text-secondary)" }}></th>
            </tr>
          </thead>
          <tbody>
            {data.invoices.map((inv) => (
              <tr key={inv.id} style={{ borderBottom: "1px solid var(--border)" }}>
                <td className="px-4 py-3 font-medium">{formatPence(inv.amountPence)}</td>
                <td className="px-4 py-3">
                  <a href={`/api/my/invoices/${inv.id}/file`} className="inline-flex items-center gap-1" style={{ color: "var(--cyan)" }}>
                    <Download className="h-3.5 w-3.5" />
                    {inv.fileName}
                  </a>
                </td>
                <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>
                  {new Date(inv.createdAt).toLocaleDateString("en-GB")}
                </td>
                <td className="px-4 py-3">
                  {inv.status === "PAID" ? (
                    <span className="badge" style={{ background: "rgba(34,197,94,0.15)", color: "var(--success)" }}>
                      Paid {inv.paidAt && new Date(inv.paidAt).toLocaleDateString("en-GB")}
                    </span>
                  ) : (
                    <span className="badge" style={{ background: "rgba(255,255,255,0.06)", color: "var(--text-secondary)" }}>
                      Awaiting payment
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {inv.status === "PENDING" && (
                    <button onClick={() => handleWithdraw(inv.id)} style={{ color: "var(--danger)" }} title="Withdraw invoice">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {data.invoices.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center" style={{ color: "var(--text-muted)" }}>
                  No invoices submitted yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="card p-4">
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>{label}</p>
      <p className="mt-1 text-xl font-bold" style={{ color: accent ? "var(--cyan)" : "white" }}>{value}</p>
    </div>
  );
}
