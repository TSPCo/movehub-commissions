"use client";

import { useEffect, useState } from "react";
import { RefreshCw, CalendarClock, AlertTriangle } from "lucide-react";
import { formatPence } from "@/lib/money";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type Row = {
  userId: string;
  name: string;
  email: string;
  fileCountAtStart: number | null;
  completions: number;
  calc: { basePence: number; bonusThreshold: number | null; bonusHit: boolean; bonusPence: number; totalPence: number };
};

function currentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function AdminCommissionsClient() {
  const [monthValue, setMonthValue] = useState(currentMonthValue());
  const [currentYear] = useState(() => new Date().getFullYear());
  const [rows, setRows] = useState<Row[]>([]);
  const [totalOwedPence, setTotalOwedPence] = useState(0);
  const [unmatchedCount, setUnmatchedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [snapshotting, setSnapshotting] = useState(false);
  const [actionResult, setActionResult] = useState<string | null>(null);

  const [year, month] = monthValue.split("-").map(Number);

  function load() {
    setLoading(true);
    fetch(`/api/admin/commissions?year=${year}&month=${month}`)
      .then((res) => res.json())
      .then((data) => {
        setRows(data.rows ?? []);
        setTotalOwedPence(data.totalOwedPence ?? 0);
        setUnmatchedCount(data.unmatchedCount ?? 0);
        setLoading(false);
      });
  }

  useEffect(load, [year, month]);

  async function handleSync() {
    setSyncing(true);
    setActionResult(null);
    const res = await fetch("/api/admin/sync-completions", { method: "POST" });
    const data = await res.json();
    setSyncing(false);
    if (!res.ok) {
      setActionResult(`Sync failed: ${data.error}`);
      return;
    }
    setActionResult(
      `Sync complete: ${data.found} newly completed matter${data.found === 1 ? "" : "s"} found (${data.checked} checked).${data.stoppedEarly ? " Stopped early on InTouch's rate limit — run again shortly." : ""}`
    );
    load();
  }

  async function handleSnapshot(force: boolean) {
    setSnapshotting(true);
    setActionResult(null);
    const res = await fetch("/api/admin/take-snapshot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force }),
    });
    const data = await res.json();
    setSnapshotting(false);
    if (!res.ok) {
      setActionResult(`Snapshot failed: ${data.error}`);
      return;
    }
    setActionResult(
      `Snapshot for ${MONTH_NAMES[data.month - 1]} ${data.year}: ${data.created} recorded, ${data.alreadyExisted} already had one.`
    );
    load();
  }

  return (
    <div>
      <div className="card mb-6 flex flex-wrap items-center gap-3 p-4">
        <label className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>Period</label>
        <select
          value={month}
          onChange={(e) => setMonthValue(`${year}-${String(Number(e.target.value)).padStart(2, "0")}`)}
          className="px-3 py-2 text-sm"
        >
          {MONTH_NAMES.map((name, i) => (
            <option key={name} value={i + 1}>{name}</option>
          ))}
        </select>
        <select
          value={year}
          onChange={(e) => setMonthValue(`${e.target.value}-${String(month).padStart(2, "0")}`)}
          className="px-3 py-2 text-sm"
        >
          {Array.from({ length: 3 }, (_, i) => currentYear - 1 + i).map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <div className="ml-auto flex gap-2">
          <button onClick={() => handleSnapshot(false)} disabled={snapshotting} className="btn-secondary flex items-center gap-1.5 px-3 py-2 text-sm">
            <CalendarClock className="h-4 w-4" />
            {snapshotting ? "Working…" : "Take this month's snapshot"}
          </button>
          <button onClick={handleSync} disabled={syncing} className="btn-primary flex items-center gap-1.5 px-3 py-2 text-sm">
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing… can take a while" : "Sync completions from InTouch"}
          </button>
        </div>
      </div>

      {actionResult && (
        <div className="card mb-6 p-4 text-sm" style={{ color: "var(--text-secondary)" }}>{actionResult}</div>
      )}

      {!loading && unmatchedCount > 0 && (
        <div
          className="card mb-6 flex items-center gap-2 p-4 text-sm"
          style={{ borderColor: "var(--warning)", color: "var(--warning)" }}
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {unmatchedCount} completion{unmatchedCount === 1 ? "" : "s"} this month couldn&apos;t be attributed to
          anyone — check the InTouch fee earner names on the Staff page.
        </div>
      )}

      <div className="card mb-6 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
          <h2 className="text-sm font-semibold">Commission by team member</h2>
          {!loading && <span className="text-sm" style={{ color: "var(--cyan)" }}>{formatPence(totalOwedPence)} total owed</span>}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--text-secondary)" }}>Name</th>
              <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--text-secondary)" }}>Files at start</th>
              <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--text-secondary)" }}>Completed</th>
              <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--text-secondary)" }}>Bonus threshold</th>
              <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--text-secondary)" }}>Bonus hit</th>
              <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--text-secondary)" }}>Total owed</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center" style={{ color: "var(--text-muted)" }}>Loading…</td>
              </tr>
            )}
            {!loading &&
              rows.map((r) => (
                <tr key={r.userId} className="table-row-hover" style={{ borderBottom: "1px solid var(--border)" }}>
                  <td className="px-4 py-3 font-medium">{r.name}</td>
                  <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>{r.fileCountAtStart ?? "—"}</td>
                  <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>{r.completions}</td>
                  <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>{r.calc.bonusThreshold ?? "—"}</td>
                  <td className="px-4 py-3">
                    {r.calc.bonusThreshold == null ? (
                      <span style={{ color: "var(--text-muted)" }}>—</span>
                    ) : r.calc.bonusHit ? (
                      <span className="badge" style={{ background: "rgba(34,197,94,0.15)", color: "var(--success)" }}>Yes</span>
                    ) : (
                      <span className="badge" style={{ background: "rgba(255,255,255,0.06)", color: "var(--text-secondary)" }}>No</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-semibold" style={{ color: "var(--cyan)" }}>{formatPence(r.calc.totalPence)}</td>
                </tr>
              ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center" style={{ color: "var(--text-muted)" }}>
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
