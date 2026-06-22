"use client";

import { useEffect, useMemo, useState } from "react";
import type { NewsItem } from "@/lib/yahoo";
import { THEME_BASKETS, WATCHLIST } from "@/lib/config";

const TABS = [
  { id: "all", label: "All" },
  ...THEME_BASKETS.map((b) => ({ id: b.id, label: b.title.split(" ")[0] })),
  { id: "macro", label: "Macro" },
];

const MACRO_SYMBOLS = ["^GSPC", "^NDX", "DX-Y.NYB", "BTC-USD", "CL=F", "GC=F"];

export default function NewsPulse() {
  const [tab, setTab] = useState<string>("all");
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);

  const symbols = useMemo(() => {
    if (tab === "all") {
      const all = new Set<string>();
      for (const t of WATCHLIST) all.add(t.symbol);
      for (const b of THEME_BASKETS) for (const s of b.symbols.slice(0, 3)) all.add(s);
      return Array.from(all);
    }
    if (tab === "macro") return MACRO_SYMBOLS;
    const basket = THEME_BASKETS.find((b) => b.id === tab);
    return basket ? basket.symbols : [];
  }, [tab]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const q = encodeURIComponent(symbols.join(","));
    fetch(`/api/news?symbols=${q}&perSymbol=3`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        setNews(j?.news ?? []);
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [symbols]);

  return (
    <div className="rounded-xl border border-ink-700 bg-ink-850/60 backdrop-blur">
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-700 px-4 py-3">
        <h2 className="mr-2 text-sm font-semibold uppercase tracking-wider text-ink-100">News pulse</h2>
        <div className="flex flex-wrap gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-full px-3 py-1 text-[11px] uppercase tracking-wider transition ${
                tab === t.id
                  ? "bg-ember-500 text-black"
                  : "border border-ink-600 text-ink-200 hover:border-ember-500/50 hover:text-ink-50"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <ul className="divide-y divide-ink-700">
        {loading && <li className="px-4 py-6 text-center text-xs text-ink-300">Fetching headlines…</li>}
        {!loading && news.length === 0 && (
          <li className="px-4 py-6 text-center text-xs text-ink-300">No headlines.</li>
        )}
        {news.slice(0, 30).map((n) => (
          <li key={n.uuid || n.link} className="px-4 py-3 transition hover:bg-ink-800/60">
            <a href={n.link} target="_blank" rel="noopener noreferrer" className="block">
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <div className="text-sm leading-snug text-ink-50 group-hover:text-ember-300">{n.title}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] uppercase tracking-widest text-ink-300">
                    <span>{n.publisher}</span>
                    <span>·</span>
                    <span>{relativeTime(n.publishedAt)}</span>
                    {n.relatedTickers?.slice(0, 4).map((t) => (
                      <span key={t} className="rounded border border-ink-600 px-1.5 py-px text-[9px] text-ink-200">{t}</span>
                    ))}
                  </div>
                </div>
              </div>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function relativeTime(ms: number) {
  const diff = Date.now() - ms;
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}
