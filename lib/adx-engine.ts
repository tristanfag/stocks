import { getOHLC } from "./yahoo";
import { adx } from "./stats";
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
  isBuy: boolean;               // BUY_FRESH or BUY_STRONG
  rationale: string;
  weeks: number;                // weekly bars used
};

export type AdxReport = {
  asOf: number;
  asOfDate: string;
  timeframe: "weekly";
  period: number;
  dominantThemes: { mid: string | null; long: string | null };
  buys: AdxRow[];               // BUY signals, dominant-theme first then by ADX
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
        if (bars.length < 2 * PERIOD + 2) return null;
        const a = adx(bars.map((b) => b.h), bars.map((b) => b.l), bars.map((b) => b.c), PERIOD);
        if (!a) return null;
        return classify(sym, symbolThemes.get(sym) ?? [], dominantSyms.has(sym), a);
      } catch {
        return null;
      }
    }));
    for (const r of results) if (r) rows.push(r);
  }

  // BUY list: dominant-theme members first, then by ADX strength desc.
  const buys = rows
    .filter((r) => r.isBuy)
    .sort((a, b) =>
      (Number(b.inDominantTheme) - Number(a.inDominantTheme)) ||
      (b.adx - a.adx),
    );

  const all = rows.sort((a, b) => b.adx - a.adx);

  const report: AdxReport = {
    asOf: Date.now(),
    asOfDate: dayKey(new Date()),
    timeframe: "weekly",
    period: PERIOD,
    dominantThemes: { mid: midId, long: longId },
    buys,
    all,
    methodology: [
      `Weekly ADX(${PERIOD}) per Wilder. ADX = trend strength; +DI/-DI = direction.`,
      "BUY = uptrend (+DI > -DI) with trend strength. Two flavours:",
      "  • FRESH — +DI crossed above -DI on the latest weekly bar AND ADX ≥ 20. Earliest entry; catches the trend as it turns up.",
      "  • STRONG — +DI > -DI, ADX ≥ 25 and rising. Established, higher-conviction uptrend.",
      "UPTREND (no buy) = +DI > -DI but ADX weak or falling — trend present but low conviction.",
      "NEUTRAL = ADX < 20 — range-bound, no tradable trend. DOWNTREND = -DI > +DI.",
      "Dominant-theme rows (members of the currently-reigning medium/long themes) are prioritised — that's where you follow the trend early.",
      "Weekly timeframe smooths daily noise; signals change at most once per week. Not a forecast — a trend-state classifier.",
    ],
  };
  CACHE.ts = Date.now();
  CACHE.data = report;
  return report;
}

function classify(
  symbol: string,
  themes: string[],
  inDominantTheme: boolean,
  a: NonNullable<ReturnType<typeof adx>>,
): AdxRow {
  const { adx: adxV, adxPrev, plusDI, minusDI, plusDIPrev, minusDIPrev } = a;
  const adxRising = adxPrev != null ? adxV > adxPrev : false;
  const up = plusDI > minusDI;
  const freshCross =
    up && plusDIPrev != null && minusDIPrev != null && plusDIPrev <= minusDIPrev;

  let signal: AdxSignal;
  let rationale: string;

  if (!up) {
    signal = "DOWNTREND";
    rationale = `-DI ${minusDI.toFixed(0)} > +DI ${plusDI.toFixed(0)} (ADX ${adxV.toFixed(0)}) — downtrend, avoid.`;
  } else if (adxV < 20) {
    signal = "NEUTRAL";
    rationale = `ADX ${adxV.toFixed(0)} < 20 — no trend yet (range-bound), +DI leads but weak.`;
  } else if (freshCross && adxV >= 20) {
    signal = "BUY_FRESH";
    rationale = `+DI crossed above -DI this week, ADX ${adxV.toFixed(0)}${adxRising ? " rising" : ""} — fresh uptrend, early entry.`;
  } else if (adxV >= 25 && adxRising) {
    signal = "BUY_STRONG";
    rationale = `+DI ${plusDI.toFixed(0)} > -DI ${minusDI.toFixed(0)}, ADX ${adxV.toFixed(0)} rising — established strong uptrend.`;
  } else {
    signal = "UPTREND";
    rationale = `+DI > -DI but ADX ${adxV.toFixed(0)}${adxRising ? " rising" : " flat/falling"} — uptrend, low conviction.`;
  }

  const isBuy = signal === "BUY_FRESH" || signal === "BUY_STRONG";

  return {
    symbol, themes, inDominantTheme,
    adx: adxV, plusDI, minusDI,
    adxRising, freshCross,
    signal, isBuy, rationale,
    weeks: a.bars,
  };
}
