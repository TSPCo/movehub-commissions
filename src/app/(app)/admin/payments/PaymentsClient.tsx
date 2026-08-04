"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Download, Trash2 } from "lucide-react";
import { formatPence } from "@/lib/money";

type Invoice = {
  id: string;
  amountPence: number;
  fileName: string;
  status: "PENDING" | "PAID";
  paidAt: string | null;
  createdAt: string;
  uploadedBy: { name: string | null; email: string } | null;
};

type Row = {
  userId: string;
  name: string;
  email: string;
  lifetimeEarnedPence: number;
  totalPaidPence: number;
  outstandingPence: number;
  invoices: Invoice[];
};

export function PaymentsClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    fetch("/api/admin/payments")
      .then((res) => res.json())
      .then((data) => {
        setRows(data.rows ?? []);
        setLoading(false);
      });
  }

  useEffect(load, []);

  async function markStatus(id: string, status: "PAID" | "PENDING") {
    setError(null);
    const res = await fetch(`/api/admin/payments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "Something went wrong");
      return;
    }
    load();
  }

  async function removeInvoice(id: string) {
    if (!confirm("Delete this invoice? This can't be undone.")) return;
    setError(null);
    const res = await fetch(`/api/admin/payments/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "Something went wrong");
      return;
    }
    load();
  }

  const totalOutstandingPence = rows.reduce((sum, r) => sum + r.outstandingPence, 0);

  return (
    <div>
      {error && (
        <div className="card mb-4 p-4 text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </div>
      )}

      <div className="card mb-6 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
          <h2 className="text-sm font-semibold">Outstanding by team member</h2>
          {!loading && <span className="text-sm" style={{ color: "var(--cyan)" }}>{formatPence(totalOutstandingPence)} total outstanding</span>}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <th className="w-8 px-4 py-3" />
              <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--text-secondary)" }}>Name</th>
              <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--text-secondary)" }}>Earned to date</th>
              <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--text-secondary)" }}>Paid</th>
              <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--text-secondary)" }}>Outstanding</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center" style={{ color: "var(--text-muted)" }}>Loading…</td>
              </tr>
            )}
            {!loading &&
              rows.map((r) => (
                <RowGroup
                  key={r.userId}
                  row={r}
                  expanded={expanded === r.userId}
                  onToggle={() => setExpanded(expanded === r.userId ? null : r.userId)}
                  onMarkStatus={markStatus}
                  onRemove={removeInvoice}
                  onUploaded={load}
                />
              ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center" style={{ color: "var(--text-muted)" }}>
                  No staff with an InTouch fee earner name set yet — add one on the Staff page.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RowGroup({
  row,
  expanded,
  onToggle,
  onMarkStatus,
  onRemove,
  onUploaded,
}: {
  row: Row;
  expanded: boolean;
  onToggle: () => void;
  onMarkStatus: (id: string, status: "PAID" | "PENDING") => void;
  onRemove: (id: string) => void;
  onUploaded: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    const form = new FormData();
    form.set("userId", row.userId);
    form.set("amountPence", String(Math.round(Number(amount) * 100)));
    form.set("file", file);
    const res = await fetch("/api/admin/payments", { method: "POST", body: form });
    const body = await res.json().catch(() => ({}));
    setUploading(false);
    if (!res.ok) {
      setUploadError(body.error || "Upload failed");
      return;
    }
    setAmount("");
    setFile(null);
    onUploaded();
  }

  return (
    <>
      <tr className="table-row-hover cursor-pointer" style={{ borderBottom: "1px solid var(--border)" }} onClick={onToggle}>
        <td className="px-4 py-3" style={{ color: "var(--text-muted)" }}>
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </td>
        <td className="px-4 py-3 font-medium">{row.name}</td>
        <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>{formatPence(row.lifetimeEarnedPence)}</td>
        <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>{formatPence(row.totalPaidPence)}</td>
        <td className="px-4 py-3 font-semibold" style={{ color: row.outstandingPence > 0 ? "var(--cyan)" : "var(--text-muted)" }}>
          {formatPence(row.outstandingPence)}
        </td>
      </tr>
      {expanded && (
        <tr style={{ borderBottom: "1px solid var(--border)" }}>
          <td colSpan={5} className="px-4 py-4" style={{ background: "rgba(255,255,255,0.02)" }}>
            <form onSubmit={handleUpload} className="mb-4 flex flex-wrap items-end gap-3" onClick={(e) => e.stopPropagation()}>
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
                {uploading ? "Uploading…" : "Upload invoice"}
              </button>
              {uploadError && <span className="text-xs" style={{ color: "var(--danger)" }}>{uploadError}</span>}
            </form>

            {row.invoices.length === 0 ? (
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>No invoices submitted yet.</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    <th className="px-2 py-2 text-left font-medium" style={{ color: "var(--text-muted)" }}>Amount</th>
                    <th className="px-2 py-2 text-left font-medium" style={{ color: "var(--text-muted)" }}>File</th>
                    <th className="px-2 py-2 text-left font-medium" style={{ color: "var(--text-muted)" }}>Uploaded by</th>
                    <th className="px-2 py-2 text-left font-medium" style={{ color: "var(--text-muted)" }}>Submitted</th>
                    <th className="px-2 py-2 text-left font-medium" style={{ color: "var(--text-muted)" }}>Status</th>
                    <th className="px-2 py-2 text-left font-medium" style={{ color: "var(--text-muted)" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {row.invoices.map((inv) => (
                    <tr key={inv.id} style={{ borderBottom: "1px solid var(--border)" }} onClick={(e) => e.stopPropagation()}>
                      <td className="px-2 py-2 font-medium">{formatPence(inv.amountPence)}</td>
                      <td className="px-2 py-2">
                        <a
                          href={`/api/admin/payments/${inv.id}/file`}
                          className="inline-flex items-center gap-1"
                          style={{ color: "var(--cyan)" }}
                        >
                          <Download className="h-3 w-3" />
                          {inv.fileName}
                        </a>
                      </td>
                      <td className="px-2 py-2" style={{ color: "var(--text-secondary)" }}>
                        {inv.uploadedBy?.name ?? inv.uploadedBy?.email ?? "—"}
                      </td>
                      <td className="px-2 py-2" style={{ color: "var(--text-secondary)" }}>
                        {new Date(inv.createdAt).toLocaleDateString("en-GB")}
                      </td>
                      <td className="px-2 py-2">
                        {inv.status === "PAID" ? (
                          <button
                            onClick={() => onMarkStatus(inv.id, "PENDING")}
                            className="badge"
                            style={{ background: "rgba(34,197,94,0.15)", color: "var(--success)" }}
                          >
                            Paid {inv.paidAt && new Date(inv.paidAt).toLocaleDateString("en-GB")}
                          </button>
                        ) : (
                          <button
                            onClick={() => onMarkStatus(inv.id, "PAID")}
                            className="badge"
                            style={{ background: "rgba(255,255,255,0.06)", color: "var(--text-secondary)" }}
                          >
                            Mark as paid
                          </button>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <button onClick={() => onRemove(inv.id)} style={{ color: "var(--danger)" }} title="Delete invoice">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
