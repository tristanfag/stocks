"use client";

import { useEffect, useState } from "react";
import type { Quote } from "@/lib/yahoo";
import { WATCHLIST } from "@/lib/config";
import { formatPrice, formatPct, formatCompact, changeClass } from "@/lib/format";
import Sparkline from "./Sparkline";

type Props = {
  selected: string;
  onSelect: (symbol: string) => void;
};

export default function Watchlist({ selected, onSelect }: Props) {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const symbols = WATCHLIST.map((t) => t.symbol).join(",");
    const load = () =>
      fetch(`/api/quotes?symbols=${encodeURIComponent(symbols)}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => {
          if (cancelled) return;
          if (j?.quotes) setQuotes(j.quotes);
          setLoading(false);
        })
        .catch(() => { if (!cancelled) setLoading(false); });
    load();
    const id = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return (
    <div className="rounded-xl border border-ink-700 bg-ink-850/60 backdrop-blur">
      <div className="flex items-center justify-between border-b border-ink-700 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 animate-pulse-dot rounded-full bg-ember-500 shadow-glow" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-100">Watchlist</h2>
        </div>
        <span className="text-[10px] uppercase tracking-widest text-ink-300">refresh 30s</span>
      </div>
      <div className="divide-y divide-ink-700">
        {WATCHLIST.map((t) => {
          const q = quotes.find((x) => x.symbol === t.symbol);
          const isSel = selected === t.symbol;
          const up = (q?.changePct ?? 0) >= 0;
          return (
            <button
              key={t.symbol}
              onClick={() => onSelect(t.symbol)}
              className={`flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-ink-800 ${
                isSel ? "bg-ink-800/80 ring-1 ring-inset ring-ember-500/50" : ""
              }`}
            >
              <div className="min-w-[88px]">
                <div className="text-sm font-semibold tracking-wide text-ink-50">{t.symbol}</div>
                <div className="truncate text-[11px] text-ink-300">{t.label}</div>
              </div>
              <div className="ml-auto flex items-center gap-4">
                <Sparkline symbol={t.symbol} positive={up} />
                <div className="min-w-[80px] text-right">
                  <div className="tabular text-sm text-ink-50">{formatPrice(q?.price)}</div>
                  <div className={`tabular text-[11px] ${changeClass(q?.changePct)}`}>
                    {formatPct(q?.changePct ?? null)}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
      {loading && (
        <div className="border-t border-ink-700 px-4 py-2 text-[11px] text-ink-300">Loading…</div>
      )}
    </div>
  );
}
