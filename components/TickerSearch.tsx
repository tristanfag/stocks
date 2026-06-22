"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { TREND_GRAPH } from "@/lib/trends";
import { WATCHLIST, TICKER_STRIP } from "@/lib/config";

type Suggestion = { symbol: string; label: string; group: string };

type Props = { onSelect: (symbol: string) => void; current?: string };

const POPULAR: Suggestion[] = [
  // mega caps + common requests
  { symbol: "AAPL", label: "Apple",       group: "popular" },
  { symbol: "MSFT", label: "Microsoft",   group: "popular" },
  { symbol: "GOOGL",label: "Alphabet",    group: "popular" },
  { symbol: "AMZN", label: "Amazon",      group: "popular" },
  { symbol: "META", label: "Meta",        group: "popular" },
  { symbol: "NVDA", label: "NVIDIA",      group: "popular" },
  { symbol: "TSLA", label: "Tesla",       group: "popular" },
  { symbol: "AMD",  label: "AMD",         group: "popular" },
  { symbol: "PLTR", label: "Palantir",    group: "popular" },
  { symbol: "AVGO", label: "Broadcom",    group: "popular" },
  { symbol: "BRK-B",label: "Berkshire",   group: "popular" },
  { symbol: "JPM",  label: "JPMorgan",    group: "popular" },
  { symbol: "XOM",  label: "Exxon",       group: "popular" },
  { symbol: "LLY",  label: "Eli Lilly",   group: "popular" },
  { symbol: "NVO",  label: "Novo Nordisk",group: "popular" },
  { symbol: "COST", label: "Costco",      group: "popular" },
  { symbol: "WMT",  label: "Walmart",     group: "popular" },
  { symbol: "V",    label: "Visa",        group: "popular" },
  { symbol: "MA",   label: "Mastercard",  group: "popular" },
  { symbol: "UNH",  label: "UnitedHealth",group: "popular" },
  { symbol: "DIS",  label: "Disney",      group: "popular" },
  { symbol: "NFLX", label: "Netflix",     group: "popular" },
  { symbol: "ORCL", label: "Oracle",      group: "popular" },
  { symbol: "CRM",  label: "Salesforce",  group: "popular" },
  { symbol: "BTC-USD", label: "Bitcoin",  group: "crypto" },
  { symbol: "ETH-USD", label: "Ethereum", group: "crypto" },
  { symbol: "SOL-USD", label: "Solana",   group: "crypto" },
  { symbol: "SPY",  label: "S&P 500 ETF", group: "etf" },
  { symbol: "QQQ",  label: "Nasdaq 100 ETF", group: "etf" },
  { symbol: "DX-Y.NYB", label: "US Dollar Index", group: "fx" },
];

function buildSuggestions(): Suggestion[] {
  const map = new Map<string, Suggestion>();
  // From thematic graph
  for (const node of Object.values(TREND_GRAPH)) {
    for (const sym of node.symbols) {
      if (!map.has(sym)) map.set(sym, { symbol: sym, label: node.title, group: node.id });
    }
  }
  // From watchlist + ticker strip
  for (const t of [...WATCHLIST, ...TICKER_STRIP]) {
    if (!map.has(t.symbol)) map.set(t.symbol, { symbol: t.symbol, label: t.label || t.symbol, group: t.kind || "watchlist" });
  }
  for (const p of POPULAR) if (!map.has(p.symbol)) map.set(p.symbol, p);
  return Array.from(map.values());
}

export default function TickerSearch({ onSelect, current }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const all = useMemo(() => buildSuggestions(), []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return all.slice(0, 20);
    const starts: Suggestion[] = [];
    const contains: Suggestion[] = [];
    for (const s of all) {
      const sym = s.symbol.toLowerCase();
      const lab = s.label.toLowerCase();
      if (sym.startsWith(term) || lab.startsWith(term)) starts.push(s);
      else if (sym.includes(term) || lab.includes(term)) contains.push(s);
    }
    return [...starts, ...contains].slice(0, 20);
  }, [q, all]);

  useEffect(() => { setHighlight(0); }, [q]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // global keyboard shortcut: "/" focuses the search
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function commit(symbol: string) {
    const sym = symbol.trim().toUpperCase();
    if (!sym) return;
    onSelect(sym);
    setOpen(false);
    setQ("");
    inputRef.current?.blur();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlight((h) => Math.min(h + 1, filtered.length - 1)); setOpen(true); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      const pick = filtered[highlight];
      if (pick) commit(pick.symbol);
      else if (q.trim()) commit(q);
    }
    else if (e.key === "Escape") setOpen(false);
  }

  return (
    <div ref={wrapRef} className="relative w-72 max-w-full">
      <div className="flex items-center gap-2 rounded-md border border-ink-600 bg-ink-900 px-2.5 py-1.5 focus-within:border-ember-500/70 focus-within:shadow-glow">
        <Search size={14} className="text-ink-300" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search ticker (e.g. PLTR)…"
          spellCheck={false}
          autoComplete="off"
          className="w-full bg-transparent text-sm uppercase tracking-wide text-ink-50 placeholder-ink-300 outline-none placeholder:normal-case placeholder:tracking-normal"
        />
        <kbd className="hidden rounded border border-ink-600 px-1 text-[10px] text-ink-300 sm:inline">/</kbd>
      </div>

      {open && filtered.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-40 mt-1 max-h-80 overflow-auto rounded-md border border-ink-600 bg-ink-900 shadow-2xl">
          {filtered.map((s, i) => (
            <button
              key={s.symbol}
              onMouseEnter={() => setHighlight(i)}
              onMouseDown={(e) => { e.preventDefault(); commit(s.symbol); }}
              className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs transition ${
                i === highlight ? "bg-ember-500/15 text-ink-50" : "text-ink-100 hover:bg-ink-800"
              } ${current === s.symbol ? "ring-1 ring-inset ring-ember-500/40" : ""}`}
            >
              <span className="flex items-center gap-2">
                <span className="font-semibold text-ink-50">{s.symbol}</span>
                <span className="text-ink-300">{s.label}</span>
              </span>
              <span className="text-[9px] uppercase tracking-widest text-ink-300">{s.group}</span>
            </button>
          ))}
          <div className="border-t border-ink-700 px-3 py-1.5 text-[10px] uppercase tracking-widest text-ink-300">
            ↵ select · ↑↓ navigate · Esc close
          </div>
        </div>
      )}
    </div>
  );
}
