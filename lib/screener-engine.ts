import { getHistory, getQuotes } from "./yahoo";
import { buildUniverse, type UniverseEntry } from "./universe";
import { getFundamentals } from "./fundamentals";
import {
  pctChange, returns, sma, rsi, macd, zScore, score, mean,
  annualisedVol, sharpe, sortino, omega, maxDrawdown,
} from "./stats";

export type ScreenerRow = {
  symbol: string;
  name: string;
  cap: "large" | "mid" | "small";
  themes: string[];
  flavor?: string;

  price: number | null;
  changePct: number | null;
  marketCap: number | null;       // best-effort, may be null

  ret1m: number | null;
  ret3m: number | null;
  ret6m: number | null;
  ret1y: number | null;

  rsi14: number | null;
  z50: number | null;
  distFrom52wHighPct: number | null;
  vsSma50Pct: number | null;
  vsSma200Pct: number | null;
  goldenCross: boolean | null;

  volAnn: number | null;
  sharpe: number | null;
  sortino: number | null;
  omega: number | null;
  maxDd: number | null;
  // Fundamental ratios (from stockanalysis.com or yahoo quoteSummary)
  peg: number | null;
  trailingPE: number | null;
  forwardPE: number | null;
  priceToSales: number | null;
  priceToBook: number | null;
  evToEbitda: number | null;
  dividendYield: number | null;

  scores: {
    momentum: number;
    trend: number;
    anomaly: number;     // mean-reversion friendliness from z + RSI
    edgeLite: number;    // composite, no fundamentals
  };
  flags: string[];       // human tags ("oversold", "near 52w high", "golden cross", "small-cap")
};

export type ScreenerReport = {
  asOf: number;
  rows: ScreenerRow[];
};

const CACHE: { ts: number; data: ScreenerReport | null } = { ts: 0, data: null };
const TTL_MS = 30 * 60 * 1000;

export async function buildScreenerReport(): Promise<ScreenerReport> {
  if (CACHE.data && Date.now() - CACHE.ts < TTL_MS) return CACHE.data;

  const universe = buildUniverse();
  const symbols = universe.map((u) => u.symbol);

  // Quotes (chunked)
  const chunks: string[][] = [];
  for (let i = 0; i < symbols.length; i += 25) chunks.push(symbols.slice(i, i + 25));
  const quoteResults = await Promise.all(chunks.map((c) => getQuotes(c)));
  const quoteMap = new Map(quoteResults.flat().map((q) => [q.symbol, q]));

  // Histories: fetched in parallel; cache reuse means fast subsequent loads
  const histResults = await Promise.all(symbols.map((s) => getHistory(s, "1y")));

  // Fundamentals: bounded concurrency to avoid hammering stockanalysis.com.
  // Cached for 30 min once warmed; subsequent screener loads are fast.
  const fundamentalsMap = new Map<string, Awaited<ReturnType<typeof getFundamentals>>>();
  const FUNDS_CONCURRENCY = 8;
  for (let i = 0; i < symbols.length; i += FUNDS_CONCURRENCY) {
    const batch = symbols.slice(i, i + FUNDS_CONCURRENCY);
    const out = await Promise.all(batch.map(async (s) => [s, await getFundamentals(s).catch(() => null)] as const));
    for (const [s, f] of out) fundamentalsMap.set(s, f);
  }

  const rows: ScreenerRow[] = [];
  for (let i = 0; i < universe.length; i++) {
    const u = universe[i];
    const h = histResults[i];
    const q = quoteMap.get(u.symbol);
    const closes = h.map((c) => c.c);
    if (closes.length < 30) continue;

    const last = closes[closes.length - 1];
    const at = (n: number) => closes.length > n ? closes[closes.length - 1 - n] : null;
    const ret1m = at(21) ? pctChange(at(21)!, last) : null;
    const ret3m = at(63) ? pctChange(at(63)!, last) : null;
    const ret6m = at(126) ? pctChange(at(126)!, last) : null;
    const ret1y = at(252) ? pctChange(at(252)!, last) : null;

    const r = rsi(closes, 14);
    const sma50last = sma(closes, 50).at(-1) ?? null;
    const sma200last = sma(closes, 200).at(-1) ?? null;
    const z = zScore(last, closes.slice(-50));
    const yearWin = closes.slice(-252);
    const yearHigh = yearWin.length ? Math.max(...yearWin) : null;
    const distHigh = yearHigh ? ((last - yearHigh) / yearHigh) * 100 : null;
    const vsSma50 = sma50last ? ((last - sma50last) / sma50last) * 100 : null;
    const vsSma200 = sma200last ? ((last - sma200last) / sma200last) * 100 : null;
    const isCrypto = u.symbol.endsWith("-USD");
    const ppy = isCrypto ? 365 : 252;
    const dailyR = returns(closes);
    const volAnn = annualisedVol(dailyR, ppy);
    const sh = sharpe(dailyR, ppy);
    const so = sortino(dailyR, ppy);
    const om = omega(dailyR, 0);
    const mdd = maxDrawdown(closes);
    const macdNow = macd(closes);

    // ---- Component scores ----
    const momentumParts: number[] = [];
    if (ret1m != null) momentumParts.push(score(ret1m, -10, 15));
    if (ret3m != null) momentumParts.push(score(ret3m, -20, 30));
    if (ret6m != null) momentumParts.push(score(ret6m, -30, 45));
    if (ret1y != null) momentumParts.push(score(ret1y, -40, 60));
    if (r != null) momentumParts.push(score(r, 30, 65));
    const momentum = momentumParts.length ? Math.round(mean(momentumParts)) : 50;

    const trendParts: number[] = [];
    if (vsSma50 != null) trendParts.push(score(vsSma50, -10, 10));
    if (vsSma200 != null) trendParts.push(score(vsSma200, -20, 25));
    if (sma50last != null && sma200last != null) trendParts.push(sma50last > sma200last ? 75 : 25);
    if (macdNow.hist != null) trendParts.push(macdNow.hist > 0 ? 70 : 30);
    if (distHigh != null) trendParts.push(score(distHigh, -50, 0));
    const trend = trendParts.length ? Math.round(mean(trendParts)) : 50;

    // Anomaly: rewards extremes (negative z + low RSI = bullish reversion)
    const anomalyParts: number[] = [];
    if (z != null) anomalyParts.push(score(-z, -2, 2)); // negative z gives high score
    if (r != null) anomalyParts.push(score(60 - r, -10, 30));
    const anomaly = anomalyParts.length ? Math.round(mean(anomalyParts)) : 50;

    const edgeLite = Math.round(momentum * 0.4 + trend * 0.35 + anomaly * 0.25);

    const flags: string[] = [];
    if (r != null && r <= 30) flags.push("oversold");
    if (r != null && r >= 70) flags.push("overbought");
    if (z != null && z <= -1.8) flags.push("z-extreme-low");
    if (z != null && z >= 1.8) flags.push("z-extreme-high");
    if (distHigh != null && distHigh > -3) flags.push("near-52w-high");
    if (sma50last != null && sma200last != null) {
      flags.push(sma50last > sma200last ? "uptrend" : "downtrend");
    }
    if (u.cap !== "large") flags.push(u.cap === "mid" ? "mid-cap" : "small-cap");

    const f = fundamentalsMap.get(u.symbol) ?? null;
    rows.push({
      symbol: u.symbol,
      name: q?.name || u.symbol,
      cap: u.cap,
      themes: u.themes,
      flavor: u.flavor,
      price: last,
      changePct: q?.changePct ?? null,
      marketCap: q?.marketCap ?? f?.marketCap ?? null,
      ret1m, ret3m, ret6m, ret1y,
      rsi14: r,
      z50: z,
      distFrom52wHighPct: distHigh,
      vsSma50Pct: vsSma50,
      vsSma200Pct: vsSma200,
      goldenCross: sma50last != null && sma200last != null ? sma50last > sma200last : null,
      volAnn,
      sharpe: sh,
      sortino: so,
      omega: om,
      maxDd: mdd,
      peg: f?.peg ?? null,
      trailingPE: f?.trailingPE ?? null,
      forwardPE: f?.forwardPE ?? null,
      priceToSales: f?.priceToSales ?? null,
      priceToBook: f?.priceToBook ?? null,
      evToEbitda: f?.evToEbitda ?? null,
      dividendYield: f?.dividendYield ?? null,
      scores: { momentum, trend, anomaly, edgeLite },
      flags,
    });
  }

  rows.sort((a, b) => b.scores.edgeLite - a.scores.edgeLite);
  const report: ScreenerReport = { asOf: Date.now(), rows };
  CACHE.ts = Date.now();
  CACHE.data = report;
  return report;
}
