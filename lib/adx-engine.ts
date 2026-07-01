import { getOHLC } from "./yahoo";
import { adx, type AdxBar } from "./stats";
import { TREND_GRAPH } from "./trends";
import { buildTrendReport } from "./trend-engine";

export type AdxSignal =
  | "BUY_FRESH"   // +DI just crossed above -DI (early entry — catch the new trend)
  | "BUY_STRONG"  // established uptrend, ADX >= 25 and rising
  | "UPTREND"     // +DI > -DI but ADX weak/not rising (trend present, low conviction)
  | "NEUTRAL"     // ADX < 20, no clear trend (range-bound)
  | "DOWNTREND";  // -DI > +DI

export type AdxRow = {
  symbol: string;
  themes: string[];
  inDominantTheme: boolean;     // member of a currently-reigning theme (medium or long)
  adx: number;
  plusDI: number;
  minusDI: number;
  adxRising: boolean;
  freshCross: boolean;          // +DI crossed above -DI on the latest bar
  signal: AdxSignal;
  prevSignal: AdxSignal | null; // signal on the prior weekly bar
  isBuy: boolean;               // BUY_FRESH or BUY_STRONG this week
  justTriggered: boolean;       // became a BUY only on the latest weekly bar (was not a buy last week)
  rationale: string;
  weeks: number;                // weekly bars used
};

export type AdxReport = {
  asOf: number;
  asOfDate: string;
  timeframe: "weekly";
  period: number;
  dominantThemes: { mid: string | null; long: string | null };
  newBuys: AdxRow[];            // BUY that JUST triggered this week (was not a buy last week)
  buys: AdxRow[];               // all standing BUY signals (new + established)
  all: AdxRow[];                // every evaluated ticker
  methodology: string[];
};

const CACHE: { ts: number; data: AdxReport | null } = { ts: 0, data: null };
const TTL_MS = 30 * 60 * 1000;
const PERIOD = 14;

function dayKey(d: Date): string { return d.toISOString().slice(0, 10); }

export async function buildAdxReport(force = false): Promise<AdxReport> {
  if (!force && CACHE.data && Date.now() - CACHE.ts < TTL_MS) return CACHE.data;

  // Symbol → theme membership.
  const symbolThemes = new Map<string, string[]>();
  for (const node of Object.values(TREND_GRAPH)) {
    for (const sym of node.symbols) {
      const arr = symbolThemes.get(sym) ?? [];
      if (!arr.includes(node.id)) arr.push(node.id);
      symbolThemes.set(sym, arr);
    }
  }
  const symbols = Array.from(symbolThemes.keys());

  // Which themes are reigning right now → flag their members as "dominant".
  let midId: string | null = null, longId: string | null = null;
  const dominantSyms = new Set<string>();
  try {
    const trend = await buildTrendReport();
    midId = trend.reigningMid?.id ?? null;
    longId = trend.reigningLong?.id ?? null;
    for (const s of trend.reigningMid?.symbols ?? []) dominantSyms.add(s);
    for (const s of trend.reigningLong?.symbols ?? []) dominantSyms.add(s);
  } catch {/* trend optional */}

  // Fetch weekly OHLC + compute ADX, bounded concurrency.
  const rows: AdxRow[] = [];
  const CONC = 8;
  for (let i = 0; i < symbols.length; i += CONC) {
    const batch = symbols.slice(i, i + CONC);
    const results = await Promise.all(batch.map(async (sym) => {
      try {
        const bars = await getOHLC(sym, "2y", "1wk");
        if (bars.length < 2 * PERIOD + 3) return null;
        const a = adx(bars.map((b) => b.h), bars.map((b) => b.l), bars.map((b) => b.c), PERIOD);
        if (!a) return null;
        return buildRow(sym, symbolThemes.get(sym) ?? [], dominantSyms.has(sym), a);
      } catch {
        return null;
      }
    }));
    for (const r of results) if (r) rows.push(r);
  }

  const domThenAdx = (a: AdxRow, b: AdxRow) =>
    (Number(b.inDominantTheme) - Number(a.inDominantTheme)) || (b.adx - a.adx);

  // NEW buys: triggered this week only. This is the tab's primary, actionable list.
  const newBuys = rows.filter((r) => r.justTriggered).sort(domThenAdx);
  // All standing buys (new + established) for context.
  const buys = rows.filter((r) => r.isBuy).sort(domThenAdx);
  const all = rows.slice().sort((a, b) => b.adx - a.adx);

  const report: AdxReport = {
    asOf: Date.now(),
    asOfDate: dayKey(new Date()),
    timeframe: "weekly",
    period: PERIOD,
    dominantThemes: { mid: midId, long: longId },
    newBuys,
    buys,
    all,
    methodology: [
      `Weekly ADX(${PERIOD}) per Wilder. ADX = trend strength; +DI/-DI = direction.`,
      "This tab shows NEW buys — names whose weekly BUY signal JUST triggered (they were not a buy on last week's bar).",
      "BUY = uptrend (+DI > -DI) with trend strength. Two flavours:",
      "  • FRESH — +DI crossed above -DI on the latest weekly bar AND ADX ≥ 20. Earliest entry; catches the trend as it turns up.",
      "  • STRONG — +DI > -DI, ADX ≥ 25 and rising. A name that strengthened into a confirmed uptrend this week.",
      "A 'just triggered' name went from not-a-buy last week → buy this week (a DI cross up, or ADX rising through the strong threshold while +DI leads).",
      "The current weekly bar is partial mid-week, so an intraweek trigger can un-trigger by Friday — re-scan Monday for the confirmed weekly close.",
      "Dominant-theme rows (members of the currently-reigning medium/long themes) are prioritised — that's where you follow the trend early.",
      "Not a forecast — a trend-state classifier. Toggle to 'All buys' to see established uptrends too.",
    ],
  };
  CACHE.ts = Date.now();
  CACHE.data = report;
  return report;
}

/** Pure per-bar classifier — same rules applied to this week and last week. */
function classifyBar(b: AdxBar): AdxSignal {
  const up = b.plusDI > b.minusDI;
  if (!up) return "DOWNTREND";
  if (b.adx < 20) return "NEUTRAL";
  if (b.crossedUp && b.adx >= 20) return "BUY_FRESH";
  if (b.adx >= 25 && b.rising) return "BUY_STRONG";
  return "UPTREND";
}

const isBuySignal = (s: AdxSignal | null): boolean =>
  s === "BUY_FRESH" || s === "BUY_STRONG";

function buildRow(
  symbol: string,
  themes: string[],
  inDominantTheme: boolean,
  a: NonNullable<ReturnType<typeof adx>>,
): AdxRow {
  const cur = a.latest;
  const signal = classifyBar(cur);
  const prevSignal = a.prev ? classifyBar(a.prev) : null;
  const isBuy = isBuySignal(signal);
  // Just triggered: a buy this week that was NOT a buy last week.
  const justTriggered = isBuy && !isBuySignal(prevSignal);

  let rationale: string;
  const di = `+DI ${cur.plusDI.toFixed(0)} / -DI ${cur.minusDI.toFixed(0)}`;
  if (signal === "DOWNTREND") {
    rationale = `${di}, ADX ${cur.adx.toFixed(0)} — downtrend, avoid.`;
  } else if (signal === "NEUTRAL") {
    rationale = `ADX ${cur.adx.toFixed(0)} < 20 — no trend yet (range-bound).`;
  } else if (signal === "BUY_FRESH") {
    rationale = justTriggered
      ? `+DI crossed above -DI THIS week, ADX ${cur.adx.toFixed(0)}${cur.rising ? " rising" : ""} — fresh uptrend, early entry.`
      : `+DI > -DI (fresh cross), ADX ${cur.adx.toFixed(0)} — uptrend.`;
  } else if (signal === "BUY_STRONG") {
    rationale = justTriggered
      ? `Strengthened into a confirmed uptrend this week — ${di}, ADX ${cur.adx.toFixed(0)} rising.`
      : `${di}, ADX ${cur.adx.toFixed(0)} rising — established strong uptrend.`;
  } else {
    rationale = `${di}, ADX ${cur.adx.toFixed(0)}${cur.rising ? " rising" : " flat/falling"} — uptrend, low conviction.`;
  }

  return {
    symbol, themes, inDominantTheme,
    adx: cur.adx, plusDI: cur.plusDI, minusDI: cur.minusDI,
    adxRising: cur.rising, freshCross: cur.crossedUp,
    signal, prevSignal, isBuy, justTriggered, rationale,
    weeks: a.bars,
  };
}
