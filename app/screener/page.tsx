"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatPct, formatPrice, formatCompact, changeClass } from "@/lib/format";
import { TREND_GRAPH } from "@/lib/trends";

type Row = {
  symbol: string;
  name: string;
  cap: "large" | "mid" | "small";
  themes: string[];
  flavor?: string;
  price: number | null;
  changePct: number | null;
  ret1m: number | null;
  ret3m: number | null;
  ret6m: number | null;
  ret1y: number | null;
  rsi14: number | null;
  z50: number | null;
  distFrom52wHighPct: number | null;
  vsSma50Pct: number | null;
  vsSma200Pct: number | null;
  goldenCross: boolean | null;
  volAnn: number | null;
  sharpe: number | null;
  sortino: number | null;
  omega: number | null;
  maxDd: number | null;
  peg: number | null;
  trailingPE: number | null;
  forwardPE: number | null;
  priceToSales: number | null;
  priceToBook: number | null;
  evToEbitda: number | null;
  dividendYield: number | null;
  scores: { momentum: number; trend: number; anomaly: number; edgeLite: number };
  flags: string[];
};

type Preset =
  | "all" | "hidden-gems" | "momentum" | "reversal" | "near-highs" | "small-mid"
  | "best-sharpe" | "best-sortino" | "best-omega";

type Filters = {
  preset: Preset;
  cap: "all" | "large" | "mid" | "small";
  theme: string;        // theme id or "all"
  minEdge: number;      // 0..100
  rsiMin: number;       // 0..100
  rsiMax: number;
  search: string;
  sort:
    | "edgeLite" | "momentum" | "trend" | "anomaly"
    | "ret1m" | "ret3m" | "ret6m" | "ret1y"
    | "rsi14" | "z50"
    | "sharpe" | "sortino" | "omega"
    | "peg" | "trailingPE" | "forwardPE" | "priceToSales" | "priceToBook" | "evToEbitda";
  sortDir: "asc" | "desc";
};

const DEFAULT_FILTERS: Filters = {
  preset: "all",
  cap: "all",
  theme: "all",
  minEdge: 0,
  rsiMin: 0,
  rsiMax: 100,
  search: "",
  sort: "edgeLite",
  sortDir: "desc",
};

const PRESETS: { id: Preset; label: string; hint: string }[] = [
  { id: "all",          label: "All",            hint: "Whole universe" },
  { id: "hidden-gems",  label: "Hidden Gems",    hint: "small/mid + edge≥65 + RSI 35–60" },
  { id: "momentum",     label: "Momentum",       hint: "trend≥70 + momentum≥70" },
  { id: "reversal",     label: "Reversal",       hint: "RSI≤35 + z≤−1.5" },
  { id: "near-highs",   label: "Near 52w highs", hint: "<3% off the top + uptrend" },
  { id: "small-mid",    label: "Small/Mid only", hint: "small + mid caps" },
  { id: "best-sharpe",  label: "Best Sharpe",    hint: "sort by Sharpe desc, only ratio≥0.5" },
  { id: "best-sortino", label: "Best Sortino",   hint: "sort by Sortino desc, only ratio≥0.7" },
  { id: "best-omega",   label: "Best Omega",     hint: "sort by Omega desc, only ratio≥1.0" },
];

export default function ScreenerPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/screener", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (!cancelled) { setRows(j?.rows ?? []); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const themeOptions = useMemo(
    () => [{ id: "all", title: "All themes" }, ...Object.values(TREND_GRAPH).map((t) => ({ id: t.id, title: t.title }))],
    [],
  );

  const filtered = useMemo(() => {
    if (!rows) return [];
    let r = rows.slice();
    // preset
    if (filters.preset === "hidden-gems") {
      r = r.filter((x) => x.cap !== "large" && x.scores.edgeLite >= 65 && (x.rsi14 ?? 50) >= 35 && (x.rsi14 ?? 50) <= 60);
    } else if (filters.preset === "momentum") {
      r = r.filter((x) => x.scores.momentum >= 70 && x.scores.trend >= 70);
    } else if (filters.preset === "reversal") {
      r = r.filter((x) => (x.rsi14 != null && x.rsi14 <= 35) && (x.z50 != null && x.z50 <= -1.5));
    } else if (filters.preset === "near-highs") {
      r = r.filter((x) => x.distFrom52wHighPct != null && x.distFrom52wHighPct > -3 && x.goldenCross === true);
    } else if (filters.preset === "small-mid") {
      r = r.filter((x) => x.cap !== "large");
    } else if (filters.preset === "best-sharpe") {
      r = r.filter((x) => x.sharpe != null && x.sharpe >= 0.5);
    } else if (filters.preset === "best-sortino") {
      r = r.filter((x) => x.sortino != null && x.sortino >= 0.7);
    } else if (filters.preset === "best-omega") {
      r = r.filter((x) => x.omega != null && x.omega >= 1.0);
    }
    // explicit filters
    if (filters.cap !== "all") r = r.filter((x) => x.cap === filters.cap);
    if (filters.theme !== "all") r = r.filter((x) => x.themes.includes(filters.theme));
    if (filters.minEdge > 0) r = r.filter((x) => x.scores.edgeLite >= filters.minEdge);
    r = r.filter((x) => {
      if (x.rsi14 == null) return true;
      return x.rsi14 >= filters.rsiMin && x.rsi14 <= filters.rsiMax;
    });
    if (filters.search.trim()) {
      const q = filters.search.trim().toLowerCase();
      r = r.filter((x) =>
        x.symbol.toLowerCase().includes(q) ||
        (x.name?.toLowerCase().includes(q)) ||
        (x.flavor?.toLowerCase().includes(q)),
      );
    }
    // sort — preset overrides explicit sort for the "best-X" presets
    const presetSortKey: Filters["sort"] | null =
      filters.preset === "best-sharpe"  ? "sharpe"
      : filters.preset === "best-sortino" ? "sortino"
      : filters.preset === "best-omega" ? "omega"
      : null;
    const dir = filters.sortDir === "desc" ? -1 : 1;
    const key = presetSortKey ?? filters.sort;
    r.sort((a, b) => {
      const va = key === "momentum" || key === "trend" || key === "anomaly" || key === "edgeLite"
        ? (a.scores as any)[key] : (a as any)[key];
      const vb = key === "momentum" || key === "trend" || key === "anomaly" || key === "edgeLite"
        ? (b.scores as any)[key] : (b as any)[key];
      // Null/undefined always sort to the bottom regardless of direction.
      const aMissing = va == null || !Number.isFinite(va);
      const bMissing = vb == null || !Number.isFinite(vb);
      if (aMissing && bMissing) return 0;
      if (aMissing) return 1;
      if (bMissing) return -1;
      return va < vb ? -dir : va > vb ? dir : 0;
    });
    return r;
  }, [rows, filters]);

  return (
    <div className="min-h-screen text-ink-50">
      <header className="sticky top-0 z-30 border-b border-ink-700 bg-ink-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-3">
              <div className="relative h-7 w-7">
                <span className="absolute inset-0 rounded-md bg-gradient-to-br from-ember-500 to-crimson-500 shadow-glow" />
                <span className="absolute inset-[3px] rounded-[3px] bg-black" />
                <span className="absolute inset-0 grid place-items-center text-[11px] font-black text-ember-300">M</span>
              </div>
              <div>
                <div className="text-sm font-bold uppercase tracking-[0.2em] text-ink-50">Market Pulse</div>
                <div className="text-[10px] uppercase tracking-widest text-ink-300">Screener</div>
              </div>
            </Link>
          </div>
          <Link href="/" className="rounded border border-ink-600 px-3 py-1 text-[11px] uppercase tracking-widest text-ink-200 hover:border-ember-500 hover:text-ember-300">
            ← Dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto flex max-w-[1500px] flex-col gap-4 px-6 py-6">
        <div className="rounded-xl border border-ink-700 bg-ink-850/60 p-4 backdrop-blur">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase tracking-widest text-ink-300 mr-1">Preset:</span>
            {PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => setFilters((f) => ({ ...f, preset: p.id }))}
                title={p.hint}
                className={`rounded-full px-3 py-1 text-[11px] uppercase tracking-wider transition ${
                  filters.preset === p.id
                    ? "bg-ember-500 text-black"
                    : "border border-ink-600 text-ink-200 hover:border-ember-500/50 hover:text-ink-50"
                }`}
              >{p.label}</button>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5">
            <FilterField label="Cap">
              <select
                value={filters.cap}
                onChange={(e) => setFilters((f) => ({ ...f, cap: e.target.value as any }))}
                className="w-full rounded border border-ink-600 bg-ink-900 px-2 py-1 text-xs text-ink-50"
              >
                <option value="all">All</option>
                <option value="large">Large</option>
                <option value="mid">Mid</option>
                <option value="small">Small</option>
              </select>
            </FilterField>
            <FilterField label="Theme">
              <select
                value={filters.theme}
                onChange={(e) => setFilters((f) => ({ ...f, theme: e.target.value }))}
                className="w-full rounded border border-ink-600 bg-ink-900 px-2 py-1 text-xs text-ink-50"
              >
                {themeOptions.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
            </FilterField>
            <FilterField label={`Min Edge: ${filters.minEdge}`}>
              <input
                type="range" min={0} max={100} step={5}
                value={filters.minEdge}
                onChange={(e) => setFilters((f) => ({ ...f, minEdge: Number(e.target.value) }))}
                className="w-full accent-ember-500"
              />
            </FilterField>
            <FilterField label={`RSI band: ${filters.rsiMin}–${filters.rsiMax}`}>
              <div className="flex gap-2">
                <input
                  type="range" min={0} max={100} step={1}
                  value={filters.rsiMin}
                  onChange={(e) => setFilters((f) => ({ ...f, rsiMin: Math.min(Number(e.target.value), f.rsiMax) }))}
                  className="w-full accent-ember-500"
                />
                <input
                  type="range" min={0} max={100} step={1}
                  value={filters.rsiMax}
                  onChange={(e) => setFilters((f) => ({ ...f, rsiMax: Math.max(Number(e.target.value), f.rsiMin) }))}
                  className="w-full accent-ember-500"
                />
              </div>
            </FilterField>
            <FilterField label="Search">
              <input
                value={filters.search}
                onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                placeholder="ticker / name"
                className="w-full rounded border border-ink-600 bg-ink-900 px-2 py-1 text-xs text-ink-50 placeholder-ink-300"
              />
            </FilterField>
          </div>
        </div>

        <div className="rounded-xl border border-ink-700 bg-ink-850/60 backdrop-blur">
          <div className="flex items-center justify-between border-b border-ink-700 px-4 py-2">
            <div className="text-xs text-ink-300">
              {loading ? "Computing scores across the universe (~150 tickers)…"
                : `${filtered.length} matches of ${rows?.length ?? 0}`}
            </div>
            <div className="text-[10px] uppercase tracking-widest text-ink-300">refresh 30m</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-xs">
              <thead className="bg-ink-800/60 text-[10px] uppercase tracking-widest text-ink-300">
                <tr>
                  <Th label="Symbol" />
                  <Th label="Cap" />
                  <Th label="Edge"      sortKey="edgeLite" filters={filters} setFilters={setFilters} align="right" />
                  <Th label="Mom"       sortKey="momentum" filters={filters} setFilters={setFilters} align="right" />
                  <Th label="Trend"     sortKey="trend"    filters={filters} setFilters={setFilters} align="right" />
                  <Th label="Anomaly"   sortKey="anomaly"  filters={filters} setFilters={setFilters} align="right" />
                  <Th label="Price"     align="right" />
                  <Th label="1d %"      align="right" />
                  <Th label="1m %"      sortKey="ret1m" filters={filters} setFilters={setFilters} align="right" />
                  <Th label="3m %"      sortKey="ret3m" filters={filters} setFilters={setFilters} align="right" />
                  <Th label="6m %"      sortKey="ret6m"   filters={filters} setFilters={setFilters} align="right" />
                  <Th label="Sharpe"    sortKey="sharpe"  filters={filters} setFilters={setFilters} align="right" />
                  <Th label="Sortino"   sortKey="sortino" filters={filters} setFilters={setFilters} align="right" />
                  <Th label="Omega"     sortKey="omega"   filters={filters} setFilters={setFilters} align="right" />
                  <Th label="RSI"       sortKey="rsi14"   filters={filters} setFilters={setFilters} align="right" />
                  <Th label="z50"       sortKey="z50"     filters={filters} setFilters={setFilters} align="right" />
                  <Th label="vs 52wH"   align="right" />
                  <Th label="PEG"       sortKey="peg"          filters={filters} setFilters={setFilters} align="right" />
                  <Th label="P/E (fwd)" sortKey="forwardPE"    filters={filters} setFilters={setFilters} align="right" />
                  <Th label="P/S"       sortKey="priceToSales" filters={filters} setFilters={setFilters} align="right" />
                  <Th label="EV/EBITDA" sortKey="evToEbitda"   filters={filters} setFilters={setFilters} align="right" />
                  <Th label="Themes" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.symbol} className="border-t border-ink-700 hover:bg-ink-800/40">
                    <td className="px-3 py-2">
                      <div className="font-semibold text-ink-50">{r.symbol}</div>
                      <div className="truncate text-[10px] text-ink-300 max-w-[180px]">{r.flavor || r.name}</div>
                    </td>
                    <td className="px-3 py-2 uppercase text-[10px] text-ink-200">{r.cap}</td>
                    <td className="px-3 py-2 text-right">
                      <ScorePill v={r.scores.edgeLite} highlight />
                    </td>
                    <td className="px-3 py-2 text-right"><ScorePill v={r.scores.momentum} /></td>
                    <td className="px-3 py-2 text-right"><ScorePill v={r.scores.trend} /></td>
                    <td className="px-3 py-2 text-right"><ScorePill v={r.scores.anomaly} /></td>
                    <td className="px-3 py-2 text-right tabular text-ink-50">{formatPrice(r.price)}</td>
                    <td className={`px-3 py-2 text-right tabular ${changeClass(r.changePct)}`}>{formatPct(r.changePct ?? null)}</td>
                    <td className={`px-3 py-2 text-right tabular ${changeClass(r.ret1m)}`}>{formatPct(r.ret1m)}</td>
                    <td className={`px-3 py-2 text-right tabular ${changeClass(r.ret3m)}`}>{formatPct(r.ret3m)}</td>
                    <td className={`px-3 py-2 text-right tabular ${changeClass(r.ret6m)}`}>{formatPct(r.ret6m)}</td>
                    <td className={`px-3 py-2 text-right tabular ${ratioCls(r.sharpe,  { good: 1.5, mid: 0.5 })}`}>{r.sharpe  != null ? r.sharpe.toFixed(2)  : "—"}</td>
                    <td className={`px-3 py-2 text-right tabular ${ratioCls(r.sortino, { good: 2.0, mid: 0.7 })}`}>{r.sortino != null ? r.sortino.toFixed(2) : "—"}</td>
                    <td className={`px-3 py-2 text-right tabular ${ratioCls(r.omega,   { good: 1.4, mid: 1.0 })}`}>{r.omega   != null ? r.omega.toFixed(2)   : "—"}</td>
                    <td className={`px-3 py-2 text-right tabular ${rsiCls(r.rsi14)}`}>{r.rsi14 != null ? r.rsi14.toFixed(0) : "—"}</td>
                    <td className={`px-3 py-2 text-right tabular ${zCls(r.z50)}`}>{r.z50 != null ? `${r.z50 >= 0 ? "+" : ""}${r.z50.toFixed(1)}` : "—"}</td>
                    <td className={`px-3 py-2 text-right tabular ${changeClass(r.distFrom52wHighPct)}`}>{r.distFrom52wHighPct != null ? `${r.distFrom52wHighPct.toFixed(1)}%` : "—"}</td>
                    <td className={`px-3 py-2 text-right tabular ${pegCls(r.peg)}`}>{r.peg != null ? r.peg.toFixed(2) : "—"}</td>
                    <td className={`px-3 py-2 text-right tabular ${peCls(r.forwardPE)}`}>{r.forwardPE != null ? r.forwardPE.toFixed(1) : "—"}</td>
                    <td className="px-3 py-2 text-right tabular text-ink-100">{r.priceToSales != null ? r.priceToSales.toFixed(2) : "—"}</td>
                    <td className="px-3 py-2 text-right tabular text-ink-100">{r.evToEbitda != null ? r.evToEbitda.toFixed(1) : "—"}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {r.themes.slice(0, 3).map((t) => (
                          <span key={t} className="rounded border border-ink-600 px-1.5 py-px text-[9px] text-ink-200">
                            {TREND_GRAPH[t]?.title?.split(" ")[0] || t}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
                {!loading && filtered.length === 0 && (
                  <tr><td colSpan={22} className="px-4 py-8 text-center text-ink-300">No tickers match these filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-ink-300">{label}</div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Th({ label, sortKey, filters, setFilters, align }: {
  label: string;
  sortKey?: Filters["sort"];
  filters?: Filters;
  setFilters?: React.Dispatch<React.SetStateAction<Filters>>;
  align?: "left" | "right";
}) {
  const interactive = !!sortKey && !!filters && !!setFilters;
  const active = interactive && filters!.sort === sortKey;
  const arrow = !active ? "" : filters!.sortDir === "desc" ? " ↓" : " ↑";
  return (
    <th
      onClick={() => {
        if (!interactive) return;
        setFilters!((f) => ({
          ...f,
          sort: sortKey!,
          sortDir: f.sort === sortKey ? (f.sortDir === "desc" ? "asc" : "desc") : "desc",
        }));
      }}
      className={`px-3 py-2 ${align === "right" ? "text-right" : "text-left"} ${interactive ? "cursor-pointer select-none hover:text-ink-50" : ""} ${active ? "text-ember-300" : ""}`}
    >
      {label}{arrow}
    </th>
  );
}

function ScorePill({ v, highlight }: { v: number; highlight?: boolean }) {
  const color =
    v >= 70 ? "text-emerald-300"
    : v >= 40 ? (highlight ? "text-ember-300" : "text-ink-100")
    : "text-loss";
  return <span className={`tabular font-semibold ${color}`}>{v}</span>;
}

function rsiCls(r: number | null) {
  if (r == null) return "text-ink-100";
  if (r <= 30) return "text-gain";
  if (r >= 70) return "text-loss";
  return "text-ink-100";
}
function zCls(z: number | null) {
  if (z == null) return "text-ink-100";
  if (z <= -1.5) return "text-gain";
  if (z >= 1.5) return "text-loss";
  return "text-ink-100";
}
function ratioCls(v: number | null, t: { good: number; mid: number }) {
  if (v == null) return "text-ink-100";
  if (v >= t.good) return "text-gain";
  if (v >= t.mid)  return "text-emerald-300";
  if (v >= 0)      return "text-ink-100";
  return "text-loss";
}
// PEG: <1 cheap-vs-growth, 1-2 fair, 2-3 stretched, >3 expensive
function pegCls(v: number | null) {
  if (v == null) return "text-ink-300";
  if (v <= 0) return "text-loss";
  if (v < 1)   return "text-gain";
  if (v < 2)   return "text-emerald-300";
  if (v < 3)   return "text-ink-100";
  return "text-loss";
}
// Forward P/E: <15 cheap, 15-25 fair, 25-40 expensive, >40 very expensive
function peCls(v: number | null) {
  if (v == null) return "text-ink-300";
  if (v <= 0) return "text-loss";
  if (v < 15)  return "text-gain";
  if (v < 25)  return "text-emerald-300";
  if (v < 40)  return "text-ink-100";
  return "text-loss";
}
