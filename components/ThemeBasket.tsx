"use client";

import { useEffect, useState } from "react";
import type { Quote } from "@/lib/yahoo";
import type { ThemeBasket as TB } from "@/lib/config";
import { formatPrice, formatPct, changeClass } from "@/lib/format";

type Props = {
  basket: TB;
  onSelect: (symbol: string) => void;
};

export default function ThemeBasket({ basket, onSelect }: Props) {
  const [quotes, setQuotes] = useState<Quote[]>([]);

  useEffect(() => {
    let cancelled = false;
    const symbols = basket.symbols.join(",");
    const load = () =>
      fetch(`/api/quotes?symbols=${encodeURIComponent(symbols)}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => { if (!cancelled && j?.quotes) setQuotes(j.quotes); })
        .catch(() => {});
    load();
    const id = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [basket.symbols]);

  const sorted = [...quotes].sort((a, b) => (b.changePct ?? -Infinity) - (a.changePct ?? -Infinity));
  const valid = sorted.filter((q) => q.changePct != null);
  const avg = valid.length ? valid.reduce((a, q) => a + (q.changePct ?? 0), 0) / valid.length : null;
  const top = sorted[0];
  const bottom = sorted[sorted.length - 1];
  const up = (avg ?? 0) >= 0;

  return (
    <div className="group relative flex flex-col gap-3 overflow-hidden rounded-xl border border-ink-700 bg-ink-850/60 p-4 backdrop-blur transition hover:border-ember-500/50">
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 h-px ${
          up ? "bg-gradient-to-r from-transparent via-gain to-transparent" : "bg-gradient-to-r from-transparent via-loss to-transparent"
        }`}
      />
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-ink-50">{basket.title}</h3>
          <p className="mt-1 text-[11px] leading-snug text-ink-300">{basket.blurb}</p>
        </div>
        <div className="text-right">
          <div className={`tabular text-lg font-semibold ${changeClass(avg)}`}>{formatPct(avg)}</div>
          <div className="text-[10px] uppercase tracking-widest text-ink-300">basket avg</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-ink-700 bg-ink-800/60 p-2">
          <div className="text-[10px] uppercase tracking-widest text-ink-300">Top</div>
          {top ? (
            <button onClick={() => onSelect(top.symbol)} className="mt-0.5 block w-full text-left">
              <div className="text-sm font-medium text-ink-50">{top.symbol}</div>
              <div className={`tabular text-xs ${changeClass(top.changePct)}`}>{formatPct(top.changePct ?? null)}</div>
            </button>
          ) : <div className="text-xs text-ink-300">—</div>}
        </div>
        <div className="rounded-lg border border-ink-700 bg-ink-800/60 p-2">
          <div className="text-[10px] uppercase tracking-widest text-ink-300">Lag</div>
          {bottom ? (
            <button onClick={() => onSelect(bottom.symbol)} className="mt-0.5 block w-full text-left">
              <div className="text-sm font-medium text-ink-50">{bottom.symbol}</div>
              <div className={`tabular text-xs ${changeClass(bottom.changePct)}`}>{formatPct(bottom.changePct ?? null)}</div>
            </button>
          ) : <div className="text-xs text-ink-300">—</div>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1 border-t border-ink-700 pt-2">
        {sorted.map((q) => (
          <button
            key={q.symbol}
            onClick={() => onSelect(q.symbol)}
            className="flex items-center justify-between rounded px-1 py-0.5 text-left transition hover:bg-ink-800"
          >
            <span className="truncate text-xs text-ink-100">{q.symbol}</span>
            <span className="ml-2 flex items-center gap-2">
              <span className="tabular text-[11px] text-ink-200">{formatPrice(q.price)}</span>
              <span className={`tabular text-[11px] ${changeClass(q.changePct)}`}>{formatPct(q.changePct ?? null)}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
