import { getHistory, getQuotes } from "./yahoo";
import { TREND_GRAPH } from "./trends";
import { WATCHLIST } from "./config";
import { rsi, sma, zScore, returns, pctChange } from "./stats";

export type RegimeMetric = {
  label: string;
  value: string;
  signal: "bull" | "bear" | "neutral";
  detail: string;
};

export type Outlier = {
  symbol: string;
  price: number | null;
  changePct: number | null;
  z50: number | null;
  rsi14: number | null;
  distFrom52wHigh: number | null;
  reason: string;
};

export type EdgeReport = {
  asOf: number;
  regime: RegimeMetric[];
  oversold: Outlier[];      // candidates for mean-reversion long
  overbought: Outlier[];    // momentum exhausted / take-profit candidates
  zHigh: Outlier[];         // extreme positive z
  zLow: Outlier[];          // extreme negative z
  bigMovers: Outlier[];     // biggest |1d %| within watchlist+themes
};

const CACHE: { ts: number; data: EdgeReport | null } = { ts: 0, data: null };
const TTL_MS = 5 * 60 * 1000;

export async function buildEdgeReport(): Promise<EdgeReport> {
  if (CACHE.data && Date.now() - CACHE.ts < TTL_MS) return CACHE.data;

  // ---- Regime ---------------------------------------------------------------
  const regimeSymbols = ["^VIX", "SPY", "QQQ", "DX-Y.NYB", "BTC-USD"];
  const [vixHist, spyHist, qqqHist, dxyHist, btcHist] = await Promise.all(
    regimeSymbols.map((s) => getHistory(s, "1y")),
  );
  const regime: RegimeMetric[] = [];

  // VIX z-score
  const vixCloses = vixHist.map((c) => c.c);
  const vixLast = vixCloses.at(-1);
  const vixZ = vixLast != null && vixCloses.length > 50
    ? zScore(vixLast, vixCloses.slice(-252))
    : null;
  if (vixLast != null) {
    const sig: RegimeMetric["signal"] =
      vixLast >= 25 ? "bear" : vixLast <= 15 ? "bull" : "neutral";
    regime.push({
      label: "VIX",
      value: `${vixLast.toFixed(1)}${vixZ != null ? ` (${vixZ >= 0 ? "+" : ""}${vixZ.toFixed(1)}σ)` : ""}`,
      signal: sig,
      detail: vixLast >= 25 ? "Fear elevated" : vixLast <= 15 ? "Calm — risk-on" : "Normal vol regime",
    });
  }

  // SPY trend
  const spyClose = spyHist.map((c) => c.c);
  const spy200 = sma(spyClose, 200).at(-1);
  const spyLast = spyClose.at(-1);
  if (spyLast != null && spy200 != null) {
    const above = spyLast > spy200;
    const distPct = ((spyLast - spy200) / spy200) * 100;
    regime.push({
      label: "SPY vs 200d",
      value: `${distPct >= 0 ? "+" : ""}${distPct.toFixed(1)}%`,
      signal: above ? "bull" : "bear",
      detail: above ? "Primary uptrend intact" : "Below 200d — defensive regime",
    });
  }

  // QQQ vs SPY relative strength (90d)
  const qqqClose = qqqHist.map((c) => c.c);
  if (qqqClose.length > 90 && spyClose.length > 90) {
    const qqq90 = pctChange(qqqClose[qqqClose.length - 91], qqqClose.at(-1)!);
    const spy90 = pctChange(spyClose[spyClose.length - 91], spyClose.at(-1)!);
    if (qqq90 != null && spy90 != null) {
      const rs = qqq90 - spy90;
      regime.push({
        label: "QQQ vs SPY (90d)",
        value: `${rs >= 0 ? "+" : ""}${rs.toFixed(1)}%`,
        signal: rs > 1 ? "bull" : rs < -1 ? "bear" : "neutral",
        detail: rs > 1 ? "Tech/growth leadership" : rs < -1 ? "Defensives leading" : "Balanced",
      });
    }
  }

  // DXY 1m
  const dxyClose = dxyHist.map((c) => c.c);
  if (dxyClose.length > 21) {
    const dxy1m = pctChange(dxyClose[dxyClose.length - 22], dxyClose.at(-1)!);
    if (dxy1m != null) {
      regime.push({
        label: "DXY 1m",
        value: `${dxy1m >= 0 ? "+" : ""}${dxy1m.toFixed(1)}%`,
        signal: dxy1m < -1 ? "bull" : dxy1m > 1 ? "bear" : "neutral",
        detail: dxy1m < -1 ? "USD weakness — risk-on tailwind" : dxy1m > 1 ? "USD strength — global headwind" : "Range-bound",
      });
    }
  }

  // BTC 1m (risk appetite proxy)
  const btcClose = btcHist.map((c) => c.c);
  if (btcClose.length > 21) {
    const btc1m = pctChange(btcClose[btcClose.length - 22], btcClose.at(-1)!);
    if (btc1m != null) {
      regime.push({
        label: "BTC 1m",
        value: `${btc1m >= 0 ? "+" : ""}${btc1m.toFixed(1)}%`,
        signal: btc1m > 5 ? "bull" : btc1m < -5 ? "bear" : "neutral",
        detail: btc1m > 5 ? "Speculative appetite high" : btc1m < -5 ? "Risk-off in liquidity proxy" : "Neutral",
      });
    }
  }

  // ---- Outliers -------------------------------------------------------------
  const symbolSet = new Set<string>();
  for (const t of WATCHLIST) symbolSet.add(t.symbol);
  for (const node of Object.values(TREND_GRAPH)) for (const s of node.symbols) symbolSet.add(s);
  symbolSet.delete("DX-Y.NYB"); // skip non-equity index
  const symbols = Array.from(symbolSet);

  const quotes = await getQuotes(symbols);
  const quoteMap = new Map(quotes.map((q) => [q.symbol, q]));

  const outliers: Outlier[] = [];
  await Promise.all(
    symbols.map(async (s) => {
      const h = await getHistory(s, "1y");
      const closes = h.map((c) => c.c);
      if (closes.length < 30) return;
      const last = closes[closes.length - 1];
      const r = rsi(closes, 14);
      const win50 = closes.slice(-50);
      const z = win50.length === 50 ? zScore(last, win50) : null;
      const yearWin = closes.slice(-252);
      const yearHigh = yearWin.length ? Math.max(...yearWin) : null;
      const distHigh = yearHigh ? ((last - yearHigh) / yearHigh) * 100 : null;
      const q = quoteMap.get(s);

      let reason = "";
      if (z != null && z <= -1.8) reason = `z=${z.toFixed(1)}σ (oversold zone)`;
      else if (z != null && z >= 1.8) reason = `z=+${z.toFixed(1)}σ (overextended)`;
      else if (r != null && r <= 30) reason = `RSI=${r.toFixed(0)} (oversold)`;
      else if (r != null && r >= 70) reason = `RSI=${r.toFixed(0)} (overbought)`;
      else if (distHigh != null && distHigh > -2) reason = "Within 2% of 52w high";

      outliers.push({
        symbol: s,
        price: last,
        changePct: q?.changePct ?? null,
        z50: z,
        rsi14: r,
        distFrom52wHigh: distHigh,
        reason,
      });
    }),
  );

  const oversold = outliers
    .filter((o) => o.rsi14 != null && o.rsi14 <= 35)
    .sort((a, b) => (a.rsi14 ?? 100) - (b.rsi14 ?? 100))
    .slice(0, 6);
  const overbought = outliers
    .filter((o) => o.rsi14 != null && o.rsi14 >= 70)
    .sort((a, b) => (b.rsi14 ?? 0) - (a.rsi14 ?? 0))
    .slice(0, 6);
  const zLow = outliers
    .filter((o) => o.z50 != null && o.z50 <= -1.5)
    .sort((a, b) => (a.z50 ?? 0) - (b.z50 ?? 0))
    .slice(0, 6);
  const zHigh = outliers
    .filter((o) => o.z50 != null && o.z50 >= 1.5)
    .sort((a, b) => (b.z50 ?? 0) - (a.z50 ?? 0))
    .slice(0, 6);
  const bigMovers = outliers
    .filter((o) => o.changePct != null)
    .sort((a, b) => Math.abs(b.changePct ?? 0) - Math.abs(a.changePct ?? 0))
    .slice(0, 6);

  const report: EdgeReport = {
    asOf: Date.now(),
    regime, oversold, overbought, zHigh, zLow, bigMovers,
  };
  CACHE.ts = Date.now();
  CACHE.data = report;
  return report;
}
