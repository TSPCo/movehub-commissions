"use client";

import { useEffect, useState } from "react";
import { formatPence } from "@/lib/money";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type Completion = { id: string; address: string; postcode: string | null; completionDate: string };

type CommissionData = {
  fileCountAtStart: number | null;
  completions: Completion[];
  calc: {
    basePence: number;
    bonusThreshold: number | null;
    bonusHit: boolean;
    bonusPence: number;
    totalPence: number;
  };
  commissionPerMatterPence: number;
  bonusUpliftPercent: number;
};

function currentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function MyCommissionClient() {
  const [monthValue, setMonthValue] = useState(currentMonthValue());
  const [currentYear] = useState(() => new Date().getFullYear());
  const [data, setData] = useState<CommissionData | null>(null);
  const [loading, setLoading] = useState(true);

  const [year, month] = monthValue.split("-").map(Number);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/my/commission?year=${year}&month=${month}`)
      .then((res) => res.json())
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [year, month]);

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
      </div>

      {loading && <p style={{ color: "var(--text-muted)" }}>Loading…</p>}

      {!loading && data && (
        <>
          {data.fileCountAtStart == null && (
            <div className="card mb-6 p-4 text-sm" style={{ color: "var(--warning)" }}>
              No starting file count recorded for this month yet — your bonus progress can't be calculated until an
              admin takes (or the automatic snapshot takes) this month's snapshot. Your commission for completed
              matters still counts either way.
            </div>
          )}

          <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard label="Files at month start" value={data.fileCountAtStart == null ? "—" : String(data.fileCountAtStart)} />
            <StatCard label="Completed this month" value={String(data.completions.length)} />
            <StatCard
              label="Bonus threshold"
              value={data.calc.bonusThreshold == null ? "—" : `${data.calc.bonusThreshold}`}
            />
            <StatCard
              label="Bonus status"
              value={data.calc.bonusThreshold == null ? "—" : data.calc.bonusHit ? "Hit! 🎉" : "Not yet"}
              accent={data.calc.bonusHit ? "success" : undefined}
            />
          </div>

          <div className="card mb-6 p-5">
            <h2 className="mb-3 text-sm font-semibold">This month's commission</h2>
            <div className="flex flex-col gap-2 text-sm">
              <Row label={`${data.completions.length} matter${data.completions.length === 1 ? "" : "s"} × ${formatPence(data.commissionPerMatterPence)}`} value={formatPence(data.calc.basePence)} />
              {data.calc.bonusHit && (
                <Row label={`Bonus uplift (${data.bonusUpliftPercent}%)`} value={formatPence(data.calc.bonusPence)} accent="success" />
              )}
              <div style={{ borderTop: "1px solid var(--border)" }} className="my-1" />
              <Row label="Total owed" value={formatPence(data.calc.totalPence)} bold />
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
              <h2 className="text-sm font-semibold">Completed matters this period</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--text-secondary)" }}>Address</th>
                  <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--text-secondary)" }}>Completed</th>
                </tr>
              </thead>
              <tbody>
                {data.completions.map((c) => (
                  <tr key={c.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td className="px-4 py-3">
                      <p className="font-medium">{c.address}</p>
                      {c.postcode && <p className="text-xs" style={{ color: "var(--text-muted)" }}>{c.postcode}</p>}
                    </td>
                    <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>
                      {new Date(c.completionDate).toLocaleDateString("en-GB")}
                    </td>
                  </tr>
                ))}
                {data.completions.length === 0 && (
                  <tr>
                    <td colSpan={2} className="px-4 py-8 text-center" style={{ color: "var(--text-muted)" }}>
                      No matters completed yet this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: "success" }) {
  return (
    <div className="card p-4">
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>{label}</p>
      <p className="mt-1 text-xl font-bold" style={{ color: accent === "success" ? "var(--success)" : "white" }}>{value}</p>
    </div>
  );
}

function Row({ label, value, bold, accent }: { label: string; value: string; bold?: boolean; accent?: "success" }) {
  return (
    <div className="flex items-center justify-between">
      <span style={{ color: bold ? "white" : "var(--text-secondary)" }} className={bold ? "font-semibold" : ""}>{label}</span>
      <span
        className={bold ? "text-lg font-bold" : "font-medium"}
        style={{ color: accent === "success" ? "var(--success)" : bold ? "var(--cyan)" : "white" }}
      >
        {value}
      </span>
    </div>
  );
}
