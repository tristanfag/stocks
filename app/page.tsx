"use client";

import Link from "next/link";
import { useState } from "react";
import TickerStrip from "@/components/TickerStrip";
import Watchlist from "@/components/Watchlist";
import SelectedPanel from "@/components/SelectedPanel";
import ThemeBasket from "@/components/ThemeBasket";
import NewsPulse from "@/components/NewsPulse";
import TrendEngine from "@/components/TrendEngine";
import EdgeBar from "@/components/EdgeBar";
import TickerSearch from "@/components/TickerSearch";
import { THEME_BASKETS } from "@/lib/config";

export default function Page() {
  const [selected, setSelected] = useState<string>("NVDA");

  return (
    <div className="min-h-screen text-ink-50">
      <header className="sticky top-0 z-30 border-b border-ink-700 bg-ink-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="relative h-7 w-7">
              <span className="absolute inset-0 rounded-md bg-gradient-to-br from-ember-500 to-crimson-500 shadow-glow" />
              <span className="absolute inset-[3px] rounded-[3px] bg-black" />
              <span className="absolute inset-0 grid place-items-center text-[11px] font-black text-ember-300">M</span>
            </div>
            <div>
              <div className="text-sm font-bold uppercase tracking-[0.2em] text-ink-50">Market Pulse</div>
              <div className="text-[10px] uppercase tracking-widest text-ink-300">stocks · crypto · themes</div>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <TickerSearch onSelect={setSelected} current={selected} />
            <Link
              href="/screener"
              className="rounded-full border border-ember-500/40 bg-ember-500/10 px-3 py-1 text-[10px] font-medium uppercase tracking-widest text-ember-300 hover:bg-ember-500/20"
            >
              Screener →
            </Link>
          </div>
        </div>
        <TickerStrip />
      </header>

      <main className="mx-auto flex max-w-[1500px] flex-col gap-6 px-6 py-6">
        <TrendEngine onSelectSymbol={setSelected} />

        <EdgeBar onSelectSymbol={setSelected} />

        <section className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_1fr]">
          <Watchlist selected={selected} onSelect={setSelected} />
          <SelectedPanel symbol={selected} />
        </section>

        <section>
          <div className="mb-3 flex items-end justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-wide text-ink-50">Thematic baskets</h2>
              <p className="text-xs text-ink-300">Curated lists for the structural trends shaping the market.</p>
            </div>
            <span className="text-[10px] uppercase tracking-widest text-ink-300">refresh 60s</span>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {THEME_BASKETS.map((b) => (
              <ThemeBasket key={b.id} basket={b} onSelect={setSelected} />
            ))}
          </div>
        </section>

        <section>
          <NewsPulse />
        </section>

        <footer className="pt-6 pb-12 text-center text-[10px] uppercase tracking-widest text-ink-300">
          Data via Yahoo Finance · Charts via TradingView · Local dashboard
        </footer>
      </main>
    </div>
  );
}
