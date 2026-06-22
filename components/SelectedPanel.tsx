"use client";

import { useEffect, useState } from "react";
import type { Quote } from "@/lib/yahoo";
import { formatPrice, formatPct, changeClass } from "@/lib/format";
import TradingViewChart from "./TradingViewChart";
import InsightPanel from "./InsightPanel";

type Props = { symbol: string };

export default function SelectedPanel({ symbol }: Props) {
  const [q, setQ] = useState<Quote | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch(`/api/quotes?symbols=${encodeURIComponent(symbol)}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => { if (!cancelled) setQ(j?.quotes?.[0] ?? null); })
        .catch(() => {});
    load();
    const id = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [symbol]);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-ink-700 bg-ink-850/60 p-4 backdrop-blur">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-widest text-ember-400">{q?.marketState ?? "—"}</span>
            <span className="h-1 w-1 rounded-full bg-ink-500" />
            <span className="text-xs uppercase tracking-widest text-ink-300">{q?.currency ?? ""}</span>
          </div>
          <div className="mt-1 flex items-baseline gap-3">
            <h2 className="text-2xl font-bold tracking-wide text-ink-50">{symbol}</h2>
            <span className="text-sm text-ink-200">{q?.name}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="tabular text-3xl font-semibold text-ink-50">{formatPrice(q?.price)}</div>
          <div className={`tabular text-sm ${changeClass(q?.changePct)}`}>
            {q?.change != null ? (q.change >= 0 ? "+" : "") + q.change.toFixed(2) : "—"} ({formatPct(q?.changePct ?? null)})
          </div>
        </div>
      </div>

      <InsightPanel symbol={symbol} />

      <TradingViewChart symbol={symbol} height={460} />
    </div>
  );
}
