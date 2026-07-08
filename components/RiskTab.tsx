"use client";

import { useEffect, useState } from "react";

type Grade = "green" | "amber" | "red";
type Signal = {
  id: string; label: string; group: "market" | "macro" | "book";
  value: string; grade: Grade; weight: number; why: string; available: boolean;
};
type Tripwire = {
  symbol: string;
  status: "OK" | "WEAK" | "TRIM" | "EXIT";
  reason: string;
  trend: number | null; sharpeZ30: number | null; z50: number | null; rsi: number | null;
};
type Report = {
  asOf: number; asOfDate: string;
  index: number;
  band: "GREEN" | "AMBER" | "ORANGE" | "RED";
  action: string;
  signals: Signal[];
  tripwires: Tripwire[];
  bookDrawdownPct: number | null;
  methodology: string[];
};

const BAND_STYLE: Record<Report["band"], { text: string; border: string; bg: string }> = {
  GREEN:  { text: "text-gain",       border: "border-gain/50",       bg: "bg-gain/10" },
  AMBER:  { text: "text-ember-300",  border: "border-ember-500/50",  bg: "bg-ember-500/10" },
  ORANGE: { text: "text-ember-400",  border: "border-ember-500/70",  bg: "bg-ember-500/15" },
  RED:    { text: "text-loss",       border: "border-loss/60",       bg: "bg-loss/10" },
};

export default function RiskTab({ onSelectSymbol }: { onSelectSymbol?: (s: string) => void }) {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { void load(false); }, []);

  async function load(force: boolean) {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`/api/crash-radar${force ? "?force=1" : ""}`, { cache: "no-store" });
      const j = await r.json();
      if (j?.error) throw new Error(j.error);
      setReport(j as Report);
    } catch (e: any) { setError(String(e?.message ?? e)); }
    finally { setLoading(false); }
  }

  if (loading && !report) {
    return (
      <div className="rounded-xl border border-ember-500/30 bg-ink-900/40 p-6 text-center">
        <div className="text-sm text-ink-50">Scanning crash radar…</div>
        <div className="mt-1 text-[11px] text-ink-300">VIX term structure · credit spreads · yen carry · rates · breadth · book tripwires. ~10–30s cold.</div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-xl border border-loss/40 bg-loss/5 p-4 text-sm text-loss">
        Radar failed: {error}
        <button onClick={() => load(true)} className="ml-3 rounded border border-loss/40 px-2 py-0.5 text-xs hover:bg-loss/10">Retry</button>
      </div>
    );
  }
  if (!report) return null;

  const bs = BAND_STYLE[report.band];
  const groups: Array<{ id: Signal["group"]; title: string }> = [
    { id: "market", title: "Market internals" },
    { id: "macro", title: "Macro" },
    { id: "book", title: "Your book" },
  ];

  return (
    <div className="flex flex-col gap-3">
      {/* Gauge + action */}
      <div className={`rounded-xl border ${bs.border} ${bs.bg} p-4`}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-ink-300">
              Crash radar · sell-early composite · as of {report.asOfDate}
            </div>
            <div className="mt-1 flex items-baseline gap-3">
              <span className={`tabular text-5xl font-black ${bs.text}`}>{report.index}</span>
              <span className={`rounded-md border ${bs.border} px-2 py-0.5 text-sm font-bold uppercase tracking-widest ${bs.text}`}>{report.band}</span>
              {report.bookDrawdownPct != null && (
                <span className="text-xs text-ink-300">book DD {report.bookDrawdownPct.toFixed(1)}%</span>
              )}
            </div>
          </div>
          <button onClick={() => load(true)} disabled={loading}
            className="rounded border border-ink-600 bg-ink-900/50 px-3 py-1 text-[11px] uppercase tracking-widest text-ink-200 hover:border-ember-500/50 disabled:opacity-50">
            {loading ? "…" : "Re-scan"}
          </button>
        </div>
        {/* band ladder */}
        <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-ink-800">
          <div className="h-full bg-gain/60" style={{ width: "20%" }} />
          <div className="h-full bg-ember-500/50" style={{ width: "20%" }} />
          <div className="h-full bg-ember-500/80" style={{ width: "20%" }} />
          <div className="h-full bg-loss/70" style={{ width: "40%" }} />
        </div>
        <div className="relative mt-1 h-3">
          <span className="absolute -translate-x-1/2 text-[10px] font-bold text-ink-50" style={{ left: `${Math.min(99, Math.max(1, report.index))}%` }}>▲</span>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-ink-50">{report.action}</p>
      </div>

      {/* Tripwires */}
      <div className="rounded-lg border border-ink-700 bg-ink-850/40">
        <div className="border-b border-ink-700 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-ember-300">
          Per-holding sell tripwires
        </div>
        <table className="w-full text-xs">
          <thead className="text-[10px] uppercase tracking-widest text-ink-300">
            <tr>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Symbol</th>
              <th className="px-3 py-2 text-right">Trend</th>
              <th className="px-3 py-2 text-right">30d z</th>
              <th className="px-3 py-2 text-right">z50</th>
              <th className="px-3 py-2 text-right">RSI</th>
              <th className="px-3 py-2 text-left">Rule</th>
            </tr>
          </thead>
          <tbody>
            {report.tripwires.map((t) => (
              <tr key={t.symbol} className="border-t border-ink-700 hover:bg-ink-800/40">
                <td className="px-3 py-2"><TripBadge s={t.status} /></td>
                <td className="px-3 py-2">
                  <button onClick={() => onSelectSymbol?.(t.symbol)} className="text-sm font-bold text-ink-50 hover:text-ember-300">{t.symbol}</button>
                </td>
                <td className="px-3 py-2 text-right tabular text-ink-100">{t.trend ?? "—"}</td>
                <td className={`px-3 py-2 text-right tabular ${t.sharpeZ30 != null && t.sharpeZ30 <= -0.75 ? "text-loss" : "text-ink-100"}`}>
                  {t.sharpeZ30 != null ? `${t.sharpeZ30 >= 0 ? "+" : ""}${t.sharpeZ30.toFixed(2)}σ` : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular text-ink-100">{t.z50 != null ? `${t.z50 >= 0 ? "+" : ""}${t.z50.toFixed(1)}σ` : "—"}</td>
                <td className="px-3 py-2 text-right tabular text-ink-100">{t.rsi?.toFixed(0) ?? "—"}</td>
                <td className="px-3 py-2 text-[11px] text-ink-300">{t.reason}</td>
              </tr>
            ))}
            {report.tripwires.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-ink-300">No book positions found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Signals grouped */}
      {groups.map((g) => {
        const rows = report.signals.filter((s) => s.group === g.id);
        if (!rows.length) return null;
        return (
          <div key={g.id} className="rounded-lg border border-ink-700 bg-ink-850/40">
            <div className="border-b border-ink-700 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-ink-300">{g.title}</div>
            <table className="w-full text-xs">
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id} className="border-t border-ink-700 first:border-t-0">
                    <td className="w-4 px-3 py-2"><GradeDot g={s.grade} available={s.available} /></td>
                    <td className="px-1 py-2 font-semibold text-ink-50 whitespace-nowrap">{s.label}</td>
                    <td className="px-3 py-2 tabular text-ink-100 whitespace-nowrap">{s.value}</td>
                    <td className="px-3 py-2 text-right text-[10px] uppercase tracking-widest text-ink-400 whitespace-nowrap">w {s.weight}</td>
                    <td className="px-3 py-2 text-[11px] leading-snug text-ink-300">{s.why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}

      {/* Methodology */}
      <details className="rounded-lg border border-ink-700 bg-ink-850/40 p-3 text-xs">
        <summary className="cursor-pointer text-[10px] uppercase tracking-widest text-ink-300">Methodology · what this can and cannot do</summary>
        <ul className="mt-2 space-y-1 text-ink-100">
          {report.methodology.map((m, i) => <li key={i}>• {m}</li>)}
        </ul>
      </details>
    </div>
  );
}

function GradeDot({ g, available }: { g: Grade; available: boolean }) {
  if (!available) return <span className="inline-block h-2.5 w-2.5 rounded-full bg-ink-600" title="unavailable" />;
  const cls = g === "red" ? "bg-loss" : g === "amber" ? "bg-ember-400" : "bg-gain";
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${cls}`} />;
}

function TripBadge({ s }: { s: Tripwire["status"] }) {
  const map = {
    EXIT: "border-loss/60 bg-loss/20 text-loss",
    TRIM: "border-ember-500/60 bg-ember-500/15 text-ember-300",
    WEAK: "border-ember-500/30 bg-ember-500/5 text-ember-200",
    OK:   "border-ink-600 bg-ink-800/60 text-ink-300",
  } as const;
  return <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${map[s]}`}>{s}</span>;
}
