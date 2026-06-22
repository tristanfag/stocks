"use client";

import { useEffect, useState } from "react";
import { formatPct, formatPrice, changeClass } from "@/lib/format";

type Outlier = {
  symbol: string;
  price: number | null;
  changePct: number | null;
  z50: number | null;
  rsi14: number | null;
  distFrom52wHigh: number | null;
  reason: string;
};
type Regime = { label: string; value: string; signal: "bull" | "bear" | "neutral"; detail: string };
type Report = {
  asOf: number;
  regime: Regime[];
  oversold: Outlier[];
  overbought: Outlier[];
  zHigh: Outlier[];
  zLow: Outlier[];
  bigMovers: Outlier[];
};

type Props = { onSelectSymbol?: (s: string) => void };

export default function EdgeBar({ onSelectSymbol }: Props) {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/edge", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (!cancelled) { setReport(j); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading && !report) {
    return (
      <div className="rounded-xl border border-ink-700 bg-ink-850/60 p-6 text-center text-xs text-ink-300">
        Scanning for outliers across 70+ tickers…
      </div>
    );
  }
  if (!report) return null;

  return (
    <div className="rounded-xl border border-ink-700 bg-ink-850/60 p-4 backdrop-blur">
      <div className="mb-3 flex items-center gap-2">
        <span className="h-2 w-2 animate-pulse-dot rounded-full bg-ember-500" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-100">Edge Bar</h2>
        <span className="ml-auto text-[10px] uppercase tracking-widest text-ink-300">regime + outliers</span>
      </div>

      {/* Regime */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {report.regime.map((r) => (
          <div
            key={r.label}
            className={`rounded-lg border p-2.5 ${
              r.signal === "bull" ? "border-gain/40 bg-gain/5"
              : r.signal === "bear" ? "border-loss/40 bg-loss/5"
              : "border-ink-700 bg-ink-800/40"
            }`}
          >
            <div className="text-[10px] uppercase tracking-widest text-ink-300">{r.label}</div>
            <div className={`tabular text-base font-semibold ${
              r.signal === "bull" ? "text-gain" : r.signal === "bear" ? "text-loss" : "text-ink-50"
            }`}>{r.value}</div>
            <div className="text-[10px] leading-snug text-ink-300">{r.detail}</div>
          </div>
        ))}
      </div>

      {/* Outlier columns */}
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <OutlierColumn
          title="Mean-reversion candidates"
          subtitle="z ≤ −1.5 or RSI ≤ 35"
          items={dedupe([...report.zLow, ...report.oversold]).slice(0, 6)}
          onSelectSymbol={onSelectSymbol}
          mode="bullish"
        />
        <OutlierColumn
          title="Take-profit / exhaustion"
          subtitle="z ≥ +1.5 or RSI ≥ 70"
          items={dedupe([...report.zHigh, ...report.overbought]).slice(0, 6)}
          onSelectSymbol={onSelectSymbol}
          mode="bearish"
        />
        <OutlierColumn
          title="Biggest movers today"
          subtitle="|1d %| sorted"
          items={report.bigMovers.slice(0, 6)}
          onSelectSymbol={onSelectSymbol}
          mode="neutral"
        />
        <OutlierColumn
          title="Near 52-week highs"
          subtitle="< 2% off the top"
          items={[...report.bigMovers, ...report.overbought, ...report.zHigh]
            .filter((o) => o.distFrom52wHigh != null && o.distFrom52wHigh > -3)
            .reduce<Outlier[]>((acc, o) => acc.find((x) => x.symbol === o.symbol) ? acc : [...acc, o], [])
            .slice(0, 6)}
          onSelectSymbol={onSelectSymbol}
          mode="momentum"
        />
      </div>
    </div>
  );
}

function dedupe(items: Outlier[]): Outlier[] {
  const seen = new Map<string, Outlier>();
  for (const i of items) if (!seen.has(i.symbol)) seen.set(i.symbol, i);
  return Array.from(seen.values());
}

function OutlierColumn({
  title, subtitle, items, onSelectSymbol, mode,
}: {
  title: string; subtitle: string; items: Outlier[];
  onSelectSymbol?: (s: string) => void;
  mode: "bullish" | "bearish" | "neutral" | "momentum";
}) {
  const accent =
    mode === "bullish" ? "border-gain/30"
    : mode === "bearish" ? "border-loss/30"
    : mode === "momentum" ? "border-ember-500/30"
    : "border-ink-700";
  return (
    <div className={`rounded-lg border ${accent} bg-ink-800/40 p-3`}>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-ink-100">{title}</div>
      <div className="mb-2 text-[10px] text-ink-300">{subtitle}</div>
      <ul className="divide-y divide-ink-700">
        {items.length === 0 && <li className="py-3 text-center text-[11px] text-ink-300">None</li>}
        {items.map((o) => (
          <li key={o.symbol}>
            <button
              onClick={() => onSelectSymbol?.(o.symbol)}
              className="flex w-full items-center justify-between py-1.5 text-left transition hover:bg-ink-700/40"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-ink-50">{o.symbol}</div>
                <div className="truncate text-[10px] text-ink-300">{o.reason}</div>
              </div>
              <div className="ml-2 text-right">
                <div className="tabular text-xs text-ink-50">{formatPrice(o.price)}</div>
                <div className={`tabular text-[10px] ${changeClass(o.changePct)}`}>{formatPct(o.changePct ?? null)}</div>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
