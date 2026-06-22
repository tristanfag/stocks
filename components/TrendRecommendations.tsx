"use client";

import { useEffect, useMemo, useState } from "react";
import { formatPct, formatPrice, changeClass } from "@/lib/format";
import { TREND_GRAPH } from "@/lib/trends";

type AnalystNote = { headline: string; narrative: string; verdict?: "BUY" | "HOLD" | "SELL" };

type Recommendation = {
  symbol: string;
  themes: string[];
  inReigningMid: boolean;
  inReigningLong: boolean;
  verdict: "BUY" | "HOLD" | "SELL";
  conviction: "low" | "medium" | "high";
  reasons: string[];
  warnings: string[];
  analystNote?: AnalystNote;
  price: number | null;
  changePct: number | null;
  edge: number | null;
  trendScore: number | null;
  momentumScore: number | null;
  ret1m: number | null;
  ret3m: number | null;
  rsi14: number | null;
  z50: number | null;
  sharpeZ30: number | null;
  sharpeZ365: number | null;
  analystUpsidePct: number | null;
};

type Report = {
  asOfMs: number;
  asOfLocal: string;
  dayKey: string;
  methodology: string[];
  counts: { buy: number; hold: number; sell: number };
  recommendations: Recommendation[];
  analyst: {
    available: boolean;
    dayKey?: string;
    asOfLocal?: string;
    author?: string;
    summary?: string;
    coverage: number;
  };
};

type Props = {
  onSelectSymbol?: (s: string) => void;
};

type FilterVerdict = "all" | "BUY" | "HOLD" | "SELL";

export default function TrendRecommendations({ onSelectSymbol }: Props) {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterVerdict>("BUY");
  const [methodologyOpen, setMethodologyOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => { void load(false); }, []);

  async function load(force: boolean) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/recommendations${force ? "?force=1" : ""}`, { cache: "no-store" });
      const j = await res.json();
      if (j?.error) throw new Error(j.error);
      setReport(j as Report);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    const recs = report?.recommendations ?? [];
    return filter === "all" ? recs : recs.filter((r) => r.verdict === filter);
  }, [report, filter]);

  if (loading && !report) {
    return (
      <div className="rounded-xl border border-ember-500/30 bg-ink-900/40 p-6 text-center">
        <div className="text-sm text-ink-50">Running today's analysis…</div>
        <div className="mt-1 text-[11px] text-ink-300">Walking ~70 tickers — first run takes 30–60s while insights warm the cache. Subsequent runs are instant.</div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-xl border border-loss/40 bg-loss/5 p-4 text-sm text-loss">
        Recommendations unavailable: {error}
        <button onClick={() => load(true)} className="ml-3 rounded border border-loss/40 px-2 py-0.5 text-xs hover:bg-loss/10">Retry</button>
      </div>
    );
  }
  if (!report) return null;

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-ember-500/40 bg-ember-500/5 p-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-ember-300">
            Trend Engine recommendations · daily
          </div>
          <div className="mt-0.5 text-sm text-ink-50">As of <span className="font-semibold">{report.asOfLocal}</span></div>
          <div className="text-[11px] text-ink-300">Snapshot key: {report.dayKey} — re-runs return cached snapshot for the day. Press Re-run for fresh.</div>
        </div>
        <div className="flex items-center gap-2">
          <CountBadge label="BUY"  n={report.counts.buy}  active={filter === "BUY"}  onClick={() => setFilter("BUY")} mode="bull" />
          <CountBadge label="HOLD" n={report.counts.hold} active={filter === "HOLD"} onClick={() => setFilter("HOLD")} mode="neutral" />
          <CountBadge label="SELL" n={report.counts.sell} active={filter === "SELL"} onClick={() => setFilter("SELL")} mode="bear" />
          <CountBadge label="ALL"  n={report.recommendations.length} active={filter === "all"} onClick={() => setFilter("all")} mode="neutral" />
          <button
            onClick={() => load(true)}
            disabled={loading}
            className="rounded border border-ember-500/40 bg-ember-500/10 px-3 py-1 text-[11px] uppercase tracking-widest text-ember-300 hover:bg-ember-500/20 disabled:opacity-50"
          >
            {loading ? "…" : "Re-run today"}
          </button>
        </div>
      </div>

      {/* Analyst summary (Claude narrative — saved from chat) */}
      {report.analyst?.available && report.analyst.summary && (
        <div className="rounded-lg border border-ember-500/30 bg-gradient-to-br from-ember-500/10 via-ember-500/0 to-transparent p-4">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-ember-300">Analyst note</span>
              <span className="text-[10px] uppercase tracking-widest text-ink-300">
                by {report.analyst.author ?? "—"}
              </span>
              <span className="rounded border border-ember-500/30 px-1.5 text-[9px] uppercase tracking-widest text-ember-300">
                {report.analyst.dayKey}
              </span>
              <span className="text-[10px] text-ink-300">{report.analyst.asOfLocal}</span>
              <span className="text-[10px] text-ink-300">· {report.analyst.coverage} ticker notes</span>
            </div>
          </div>
          <p className="text-sm leading-relaxed text-ink-100">{report.analyst.summary}</p>
        </div>
      )}

      {/* Methodology */}
      <details
        open={methodologyOpen}
        onToggle={(e) => setMethodologyOpen((e.target as HTMLDetailsElement).open)}
        className="rounded-lg border border-ink-700 bg-ink-850/40 p-3 text-xs"
      >
        <summary className="cursor-pointer text-[10px] uppercase tracking-widest text-ink-300">
          Methodology · how the verdict is computed
        </summary>
        <ul className="mt-2 space-y-1 text-ink-100">
          {report.methodology.map((m, i) => <li key={i}>• {m}</li>)}
        </ul>
      </details>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-ink-700 bg-ink-850/40">
        <table className="w-full min-w-[1100px] text-xs">
          <thead className="bg-ink-800/60 text-[10px] uppercase tracking-widest text-ink-300">
            <tr>
              <th className="px-3 py-2 text-left">Verdict</th>
              <th className="px-3 py-2 text-left">Conv.</th>
              <th className="px-3 py-2 text-left">Symbol</th>
              <th className="px-3 py-2 text-left">Themes</th>
              <th className="px-3 py-2 text-right">Price</th>
              <th className="px-3 py-2 text-right">1d %</th>
              <th className="px-3 py-2 text-right">Edge</th>
              <th className="px-3 py-2 text-right">1m %</th>
              <th className="px-3 py-2 text-right">3m %</th>
              <th className="px-3 py-2 text-right">RSI</th>
              <th className="px-3 py-2 text-right">z50</th>
              <th className="px-3 py-2 text-right">Sharpe z (30d)</th>
              <th className="px-3 py-2 text-right">Tgt %</th>
              <th className="px-3 py-2 text-left">Why</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <RecommendationRow
                key={r.symbol}
                rec={r}
                onSelectSymbol={onSelectSymbol}
                expanded={!!expanded[r.symbol]}
                toggle={() => setExpanded((s) => ({ ...s, [r.symbol]: !s[r.symbol] }))}
              />
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={14} className="px-4 py-6 text-center text-ink-300">No tickers in this verdict bucket.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="text-[10px] text-ink-300">
        Disclaimer: These are systematic, rule-based research signals from public-data factor models. They are not investment advice.
        Verdicts can flip when the underlying inputs (price, regime z-scores, theme heat, analyst targets) update.
      </div>
    </div>
  );
}

function CountBadge({ label, n, active, onClick, mode }: {
  label: string; n: number; active: boolean; onClick: () => void;
  mode: "bull" | "bear" | "neutral";
}) {
  const baseColor =
    mode === "bull" ? "border-gain/40 bg-gain/10 text-gain"
    : mode === "bear" ? "border-loss/40 bg-loss/10 text-loss"
    : "border-ink-600 bg-ink-800/60 text-ink-100";
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] uppercase tracking-widest transition ${baseColor} ${active ? "ring-1 ring-inset ring-ember-500/60" : "opacity-80 hover:opacity-100"}`}
    >
      <span>{label}</span>
      <span className="tabular text-sm font-bold">{n}</span>
    </button>
  );
}

function RecommendationRow({ rec, onSelectSymbol, expanded, toggle }: {
  rec: Recommendation;
  onSelectSymbol?: (s: string) => void;
  expanded: boolean;
  toggle: () => void;
}) {
  return (
    <>
      <tr className="border-t border-ink-700 hover:bg-ink-800/30">
        <td className="px-3 py-2"><VerdictBadge v={rec.verdict} /></td>
        <td className="px-3 py-2"><ConvictionPill c={rec.conviction} v={rec.verdict} /></td>
        <td className="px-3 py-2">
          <button onClick={() => onSelectSymbol?.(rec.symbol)} className="text-left">
            <div className="text-sm font-bold text-ink-50 hover:text-ember-300">{rec.symbol}</div>
            <div className="flex items-center gap-1 text-[10px] text-ink-300">
              {rec.inReigningMid && <span className="rounded border border-ember-500/30 px-1 text-ember-300">M-leader</span>}
              {rec.inReigningLong && <span className="rounded border border-ember-500/30 px-1 text-ember-300">L-leader</span>}
            </div>
          </button>
        </td>
        <td className="px-3 py-2">
          <div className="flex flex-wrap gap-1">
            {rec.themes.slice(0, 3).map((t) => (
              <span key={t} className="rounded border border-ink-600 px-1 text-[9px] text-ink-200">
                {TREND_GRAPH[t]?.title.split(" ")[0] || t}
              </span>
            ))}
          </div>
        </td>
        <td className="px-3 py-2 text-right tabular text-ink-50">{formatPrice(rec.price)}</td>
        <td className={`px-3 py-2 text-right tabular ${changeClass(rec.changePct)}`}>{formatPct(rec.changePct ?? null)}</td>
        <td className="px-3 py-2 text-right"><EdgePill v={rec.edge} /></td>
        <td className={`px-3 py-2 text-right tabular ${changeClass(rec.ret1m)}`}>{formatPct(rec.ret1m)}</td>
        <td className={`px-3 py-2 text-right tabular ${changeClass(rec.ret3m)}`}>{formatPct(rec.ret3m)}</td>
        <td className={`px-3 py-2 text-right tabular ${rsiCls(rec.rsi14)}`}>{rec.rsi14 != null ? rec.rsi14.toFixed(0) : "—"}</td>
        <td className={`px-3 py-2 text-right tabular ${zCls(rec.z50)}`}>{rec.z50 != null ? `${rec.z50 >= 0 ? "+" : ""}${rec.z50.toFixed(1)}` : "—"}</td>
        <td className={`px-3 py-2 text-right tabular ${zCls(rec.sharpeZ30)}`}>{rec.sharpeZ30 != null ? `${rec.sharpeZ30 >= 0 ? "+" : ""}${rec.sharpeZ30.toFixed(2)}σ` : "—"}</td>
        <td className={`px-3 py-2 text-right tabular ${changeClass(rec.analystUpsidePct)}`}>{rec.analystUpsidePct != null ? `${rec.analystUpsidePct >= 0 ? "+" : ""}${rec.analystUpsidePct.toFixed(0)}%` : "—"}</td>
        <td className="px-3 py-2">
          <button onClick={toggle} className="text-[11px] text-ember-300 underline-offset-2 hover:underline">
            {expanded ? "hide" : "details"} ({rec.reasons.length}{rec.analystNote ? " + ✦" : ""})
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="border-t border-ink-700 bg-ink-900/40">
          <td colSpan={14} className="px-4 py-3">
            <div className="flex flex-col gap-4">
              {rec.analystNote && (
                <div className="rounded-md border border-ember-500/40 bg-ember-500/5 p-3">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-ember-300">Analyst take</span>
                    {rec.analystNote.verdict && rec.analystNote.verdict !== rec.verdict && (
                      <span className="rounded border border-loss/40 px-1.5 text-[9px] uppercase tracking-widest text-loss">
                        analyst: {rec.analystNote.verdict} (differs from rule: {rec.verdict})
                      </span>
                    )}
                  </div>
                  <div className="text-sm font-semibold text-ink-50">{rec.analystNote.headline}</div>
                  <p className="mt-1 text-xs leading-relaxed text-ink-100">{rec.analystNote.narrative}</p>
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-widest text-ink-300">Rule-based reasons</div>
                  <ul className="space-y-1 text-xs text-ink-100">
                    {rec.reasons.length === 0 && <li className="text-ink-300">(none triggered)</li>}
                    {rec.reasons.map((r, i) => <li key={i}>• {r}</li>)}
                  </ul>
                </div>
                {rec.warnings.length > 0 && (
                  <div>
                    <div className="mb-1 text-[10px] uppercase tracking-widest text-ink-300">Counter-indicators / things to watch</div>
                    <ul className="space-y-1 text-xs text-ink-300">
                      {rec.warnings.map((w, i) => <li key={i}>• {w}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function VerdictBadge({ v }: { v: "BUY" | "HOLD" | "SELL" }) {
  if (v === "BUY")  return <span className="rounded-md border border-gain/50 bg-gain/15 px-2 py-0.5 text-[11px] font-bold text-gain">BUY</span>;
  if (v === "SELL") return <span className="rounded-md border border-loss/50 bg-loss/15 px-2 py-0.5 text-[11px] font-bold text-loss">SELL</span>;
  return <span className="rounded-md border border-ink-600 bg-ink-800/60 px-2 py-0.5 text-[11px] font-bold text-ink-100">HOLD</span>;
}
function ConvictionPill({ c, v }: { c: "low" | "medium" | "high"; v: "BUY" | "HOLD" | "SELL" }) {
  const bg =
    v === "BUY" ? (c === "high" ? "bg-gain/30" : c === "medium" ? "bg-gain/15" : "bg-gain/5")
    : v === "SELL" ? (c === "high" ? "bg-loss/30" : c === "medium" ? "bg-loss/15" : "bg-loss/5")
    : "bg-ink-700/40";
  return <span className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-widest ${bg}`}>{c}</span>;
}
function EdgePill({ v }: { v: number | null }) {
  if (v == null) return <span className="text-ink-300">—</span>;
  const cls =
    v >= 70 ? "text-gain font-bold"
    : v >= 50 ? "text-emerald-300"
    : v >= 35 ? "text-ink-100"
    : "text-loss";
  return <span className={`tabular ${cls}`}>{v}</span>;
}
function rsiCls(r: number | null) {
  if (r == null) return "text-ink-300";
  if (r <= 30) return "text-gain";
  if (r >= 70) return "text-loss";
  return "text-ink-100";
}
function zCls(z: number | null) {
  if (z == null) return "text-ink-300";
  if (z <= -1.5) return "text-gain";
  if (z >= 1.5)  return "text-loss";
  return "text-ink-100";
}
