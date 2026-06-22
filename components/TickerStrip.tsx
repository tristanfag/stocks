"use client";

import { useEffect, useState } from "react";
import type { Quote } from "@/lib/yahoo";
import { TICKER_STRIP } from "@/lib/config";
import { formatPrice, formatPct } from "@/lib/format";

export default function TickerStrip() {
  const [quotes, setQuotes] = useState<Quote[]>([]);

  useEffect(() => {
    let cancelled = false;
    const symbols = TICKER_STRIP.map((t) => t.symbol).join(",");
    const load = () =>
      fetch(`/api/quotes?symbols=${encodeURIComponent(symbols)}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => { if (!cancelled && j?.quotes) setQuotes(j.quotes); })
        .catch(() => {});
    load();
    const id = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const labelMap = Object.fromEntries(TICKER_STRIP.map((t) => [t.symbol, t.label ?? t.symbol]));
  const items = TICKER_STRIP.map((t) => quotes.find((q) => q.symbol === t.symbol));

  return (
    <div className="relative overflow-hidden border-y border-ink-700 bg-ink-900/60 backdrop-blur">
      <div className="flex w-max animate-marquee whitespace-nowrap py-2">
        {[...items, ...items].map((q, i) => {
          const sym = TICKER_STRIP[i % TICKER_STRIP.length].symbol;
          const label = labelMap[sym];
          const up = (q?.changePct ?? 0) >= 0;
          return (
            <div key={`${sym}-${i}`} className="flex items-center gap-2 px-5">
              <span className="text-xs font-medium uppercase tracking-wider text-ink-200">{label}</span>
              <span className="tabular text-sm text-ink-50">{formatPrice(q?.price)}</span>
              <span className={`tabular text-xs ${up ? "text-gain" : "text-loss"}`}>
                {formatPct(q?.changePct ?? null)}
              </span>
              <span className="mx-3 h-1 w-1 rounded-full bg-ink-500" />
            </div>
          );
        })}
      </div>
    </div>
  );
}
