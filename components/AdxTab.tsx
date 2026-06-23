"use client";

import { useEffect, useMemo, useState } from "react";
import { TREND_GRAPH } from "@/lib/trends";

type Signal = "BUY_FRESH" | "BUY_STRONG" | "UPTREND" | "NEUTRAL" | "DOWNTREND";
type Row = {
  symbol: string;
  themes: string[];
  inDominantTheme: boolean;
  adx: number;
  plusDI: number;
  minusDI: number;
  adxRising: boolean;
  freshCross: boolean;
  signal: Signal;
  isBuy: boolean;
  rationale: string;
  weeks: number;
};
type Report = {
  asOf: number;
  asOfDate: string;
  timeframe: string;
  period: number;
  dominantThemes: { mid: string | null; long: string | null };
  buys: Row[];
  all: Row[];
  methodology: string[];
};

type Filter = "buys" | "dominant" | "all";

export default function AdxTab({ onSelectSymbol }: { onSelectSymbol?: (s: string) => void }) {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("buys");
  const [methodOpen, setMethodOpen] = useState(false);

  useEffect(() => { void load(false); }, []);

  async function load(force: boolean) {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`/api/adx${force ? "?force=1" : ""}`, { cache: "no-store" });
      const j = await r.json();
      if (j?.error) throw new Error(j.error);
      setReport(j as Report);
    } catch (e: any) { setError(String(e?.message ?? e)); }
    finally { setLoading(false); }
  }

  const rows = useMemo(() => {
    if (!report) return [];
    if (filter === "buys") return report.buys;
    if (filter === "dominant") return report.all.filter((r) => r.inDominantTheme);
    return report.all;
  }, [report, filter]);

  if (loading && !report) {
    return (
      <div className="rounded-xl border border-ember-500/30 bg-ink-900/40 p-6 text-center">
        <div className="text-sm text-ink-50">Scanning weekly ADX across the theme universe…</div>
        <div className="mt-1 text-[11px] text-ink-300">Fetching 2y of weekly bars per ticker, computing Wilder ADX(14). ~20–40s cold.</div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-xl border border-loss/40 bg-loss/5 p-4 text-sm text-loss">
        ADX scan failed: {error}
        <button onClick={() => load(true)} className="ml-3 rounded border border-loss/40 px-2 py-0.5 text-xs hover:bg-loss/10">Retry</button>
      </div>
    );
  }
  if (!report) return null;

  const freshCount = report.buys.filter((b) => b.signal === "BUY_FRESH").length;
  const strongCount = report.buys.filter((b) => b.signal === "BUY_STRONG").length;
  const domBuys = report.buys.filter((b) => b.inDominantTheme).length;

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-ember-500/40 bg-ember-500/5 p-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-ember-300">
            ADX trend scanner · weekly · Wilder({report.period})
          </div>
          <div className="mt-0.5 text-sm text-ink-50">
            <span className="text-gain font-semibold">{report.buys.length} BUY</span> signals
            <span className="text-ink-300"> · {freshCount} fresh · {strongCount} strong · {domBuys} in dominant themes</span>
          </div>
          <div className="text-[11px] text-ink-300">As of {report.asOfDate} · follow uptrends early in the reigning themes</div>
        </div>
        <div className="flex items-center gap-2">
          <FilterChip label={`BUY (${report.buys.length})`} active={filter === "buys"} onClick={() => setFilter("buys")} />
          <FilterChip label="Dominant" active={filter === "dominant"} onClick={() => setFilter("dominant")} />
          <FilterChip label={`All (${report.all.length})`} active={filter === "all"} onClick={() => setFilter("all")} />
          <button onClick={() => load(true)} disabled={loading}
            className="rounded border border-ember-500/40 bg-ember-500/10 px-3 py-1 text-[11px] uppercase tracking-widest text-ember-300 hover:bg-ember-500/20 disabled:opacity-50">
            {loading ? "…" : "Re-scan"}
          </button>
        </div>
      </div>

      {/* Methodology */}
      <details open={methodOpen} onToggle={(e) => setMethodOpen((e.target as HTMLDetailsElement).open)}
        className="rounded-lg border border-ink-700 bg-ink-850/40 p-3 text-xs">
        <summary className="cursor-pointer text-[10px] uppercase tracking-widest text-ink-300">Methodology · how the ADX signal works</summary>
        <ul className="mt-2 space-y-1 text-ink-100">
          {report.methodology.map((m, i) => <li key={i}>{m.startsWith("  ") ? <span className="ml-3">{m.trim()}</span> : <>• {m}</>}</li>)}
        </ul>
      </details>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-ink-700 bg-ink-850/40">
        <table className="w-full min-w-[820px] text-xs">
          <thead className="bg-ink-800/60 text-[10px] uppercase tracking-widest text-ink-300">
            <tr>
              <th className="px-3 py-2 text-left">Signal</th>
              <th className="px-3 py-2 text-left">Symbol</th>
              <th className="px-3 py-2 text-left">Themes</th>
              <th className="px-3 py-2 text-right">ADX</th>
              <th className="px-3 py-2 text-right">+DI</th>
              <th className="px-3 py-2 text-right">−DI</th>
              <th className="px-3 py-2 text-center">Rising</th>
              <th className="px-3 py-2 text-left">Read</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.symbol} className={`border-t border-ink-700 hover:bg-ink-800/40 ${r.inDominantTheme ? "bg-ember-500/[0.04]" : ""}`}>
                <td className="px-3 py-2"><SignalBadge s={r.signal} /></td>
                <td className="px-3 py-2">
                  <button onClick={() => onSelectSymbol?.(r.symbol)} className="text-left">
                    <span className="text-sm font-bold text-ink-50 hover:text-ember-300">{r.symbol}</span>
                    {r.inDominantTheme && <span className="ml-1.5 rounded border border-ember-500/40 px-1 text-[8px] font-bold uppercase tracking-widest text-ember-300">dominant</span>}
                  </button>
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {r.themes.slice(0, 2).map((t) => (
                      <span key={t} className="rounded border border-ink-600 px-1 text-[9px] text-ink-200">{TREND_GRAPH[t]?.title.split(" ")[0] || t}</span>
                    ))}
                  </div>
                </td>
                <td className={`px-3 py-2 text-right tabular ${adxCls(r.adx)}`}>{r.adx.toFixed(1)}</td>
                <td className="px-3 py-2 text-right tabular text-gain">{r.plusDI.toFixed(1)}</td>
                <td className="px-3 py-2 text-right tabular text-loss">{r.minusDI.toFixed(1)}</td>
                <td className="px-3 py-2 text-center">{r.adxRising ? <span className="text-gain">▲</span> : <span className="text-ink-400">▽</span>}</td>
                <td className="px-3 py-2 text-[11px] text-ink-300 max-w-[280px]">{r.rationale}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-ink-300">No signals in this view.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="text-[10px] text-ink-300">
        ADX is a trend-state classifier on the weekly timeframe — it confirms direction + strength, it does not predict price.
        A weekly signal changes at most once per week. Pair with the strategy's risk sleeves; size positions, don't all-in a single fresh cross.
      </div>
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`rounded-full px-3 py-1 text-[11px] uppercase tracking-wider transition ${active ? "bg-ember-500 text-black" : "border border-ink-600 text-ink-200 hover:border-ember-500/50 hover:text-ink-50"}`}>
      {label}
    </button>
  );
}

function SignalBadge({ s }: { s: Signal }) {
  const map: Record<Signal, { label: string; cls: string }> = {
    BUY_FRESH:  { label: "BUY · fresh",  cls: "border-gain/60 bg-gain/20 text-gain" },
    BUY_STRONG: { label: "BUY · strong", cls: "border-gain/50 bg-gain/10 text-gain" },
    UPTREND:    { label: "uptrend",      cls: "border-emerald-500/30 bg-emerald-500/5 text-emerald-300" },
    NEUTRAL:    { label: "neutral",      cls: "border-ink-600 bg-ink-800/60 text-ink-300" },
    DOWNTREND:  { label: "downtrend",    cls: "border-loss/50 bg-loss/10 text-loss" },
  };
  const m = map[s];
  return <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${m.cls}`}>{m.label}</span>;
}

function adxCls(v: number) {
  if (v >= 30) return "text-gain font-bold";
  if (v >= 25) return "text-emerald-300";
  if (v >= 20) return "text-ink-100";
  return "text-ink-400";
}
