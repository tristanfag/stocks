import { getHistory } from "./yahoo";
import { getFundamentals, type Fundamentals } from "./fundamentals";
import {
  mean, stdev, zScore, returns, sma, rsi, macd, bollinger,
  maxDrawdown, sharpe, sortino, omega, annualisedVol, beta, correlation,
  pctChange, score, meanReversionExpectedReturn,
  rollingSharpe, rollingSortino, rollingOmega, zOfLast,
} from "./stats";

export type Insight = {
  symbol: string;
  asOf: number;
  price: number | null;

  stats: {
    ret1d: number | null;
    ret1m: number | null;
    ret3m: number | null;
    ret6m: number | null;
    ret1y: number | null;
    volAnn: number | null;
    sharpe: number | null;
    sortino: number | null;
    omega: number | null;
    maxDrawdown: number | null;
    beta: number | null;
    corrSPY: number | null;
  };
  signals: {
    rsi14: number | null;
    macd: number | null;
    macdSignal: number | null;
    macdHist: number | null;
    bbPctB: number | null;
    bbUpper: number | null;
    bbLower: number | null;
    sma20: number | null;
    sma50: number | null;
    sma200: number | null;
    priceVsSma50Pct: number | null;
    priceVsSma200Pct: number | null;
    goldenCross: boolean | null;     // sma50 > sma200
    deathCross: boolean | null;      // sma50 < sma200
  };
  zscores: {
    priceVs50: number | null;
    priceVs200: number | null;
    distFrom52wHighPct: number | null;
    distFrom52wLowPct: number | null;
    volumeZ: number | null;
  };
  expected: {
    /** Implied 1σ daily move (%) → projected onto 30 trading days. */
    range1mLowPct: number | null;
    range1mHighPct: number | null;
    /** Heuristic mean-reversion expected return over ~20 trading days, %. */
    meanReversion30dPct: number | null;
    /** Analyst consensus 12m upside, %. */
    analystUpsidePct: number | null;
  };
  /**
   * Risk-adjusted return ratios computed on a recent window, then z-scored
   * against the *same ratio's distribution* over the trailing 5y of history.
   * High z = currently in a regime that is rare for this ticker.
   */
  regime: {
    historyDays: number;        // how much daily history was actually fetched
    windows: Array<"d30" | "d90" | "d180" | "d365">;
    sharpe:  Record<"d30" | "d90" | "d180" | "d365", { value: number | null; z: number | null; samples: number }>;
    sortino: Record<"d30" | "d90" | "d180" | "d365", { value: number | null; z: number | null; samples: number }>;
    omega:   Record<"d30" | "d90" | "d180" | "d365", { value: number | null; z: number | null; samples: number }>;
  };
  fundamentals: Fundamentals | null;
  scores: {
    value: number;       // 0..100
    quality: number;
    momentum: number;
    trend: number;
    edge: number;        // weighted composite
    notes: string[];
  };
};

const CACHE = new Map<string, { ts: number; data: Insight }>();
const TTL_MS = 5 * 60 * 1000;

export async function buildInsight(symbol: string): Promise<Insight> {
  const cached = CACHE.get(symbol);
  if (cached && Date.now() - cached.ts < TTL_MS) return cached.data;

  const [longHist, spy, funds] = await Promise.all([
    getHistory(symbol, "5y"),   // for regime z-scores; also covers 1y stats below
    getHistory("SPY", "1y"),
    getFundamentals(symbol),
  ]);

  const longCloses = longHist.map((c) => c.c);
  // 1y window for the existing stats section
  const closes = longCloses.slice(-Math.min(252, longCloses.length));
  const last = closes[closes.length - 1] ?? null;
  const isCrypto = symbol.endsWith("-USD");
  const periodsPerYear = isCrypto ? 365 : 252;

  // returns
  const dailyR = returns(closes);
  const longDailyR = returns(longCloses);
  const ret1d = closes.length > 1 ? pctChange(closes[closes.length - 2], closes[closes.length - 1]) : null;
  const sliceRet = (n: number) => closes.length > n ? pctChange(closes[closes.length - 1 - n], closes[closes.length - 1]) : null;
  const ret1m = sliceRet(21);
  const ret3m = sliceRet(63);
  const ret6m = sliceRet(126);
  const ret1y = sliceRet(252);

  const volAnn = annualisedVol(dailyR, periodsPerYear);
  const sh = sharpe(dailyR, periodsPerYear);
  const so = sortino(dailyR, periodsPerYear);
  const om = omega(dailyR, 0);
  const mdd = closes.length ? maxDrawdown(closes) : null;

  const spyClose = spy.map((c) => c.c);
  const spyR = returns(spyClose);
  const b = beta(dailyR, spyR);
  const corr = correlation(dailyR, spyR);

  // signals
  const sma20arr = sma(closes, 20);
  const sma50arr = sma(closes, 50);
  const sma200arr = sma(closes, 200);
  const sma20 = sma20arr.at(-1) ?? null;
  const sma50 = sma50arr.at(-1) ?? null;
  const sma200 = sma200arr.at(-1) ?? null;
  const rsi14 = rsi(closes, 14);
  const m = macd(closes);
  const bb = bollinger(closes, 20, 2);

  // z-scores
  const win50 = closes.slice(-50);
  const win200 = closes.slice(-200);
  const priceVs50 = last != null && win50.length === 50 ? zScore(last, win50) : null;
  const priceVs200 = last != null && win200.length >= 50 ? zScore(last, win200) : null;
  const yearHigh = closes.length ? Math.max(...closes.slice(-252)) : null;
  const yearLow = closes.length ? Math.min(...closes.slice(-252)) : null;
  const distHigh = last != null && yearHigh ? ((last - yearHigh) / yearHigh) * 100 : null;
  const distLow = last != null && yearLow ? ((last - yearLow) / yearLow) * 100 : null;
  const volumeZ = null; // chart endpoint doesn't always expose volume series; left as null for v1

  // expected ranges & reversion
  const dailySigma = volAnn != null ? volAnn / Math.sqrt(periodsPerYear) : null; // %
  const sigma30 = dailySigma != null ? dailySigma * Math.sqrt(30) : null; // % over 30 trading days
  const range1mLowPct = sigma30 != null ? -sigma30 : null;
  const range1mHighPct = sigma30 != null ? sigma30 : null;
  const meanRev = last != null && sma50 != null
    ? meanReversionExpectedReturn(priceVs50, last, sma50)
    : null;
  const analystUpside = funds?.targetMean != null && last != null && last > 0
    ? ((funds.targetMean - last) / last) * 100
    : null;

  // composite scores --------
  const valueScore = computeValueScore(funds);
  const qualityScore = computeQualityScore(funds);
  const momentumScore = computeMomentumScore({ ret1m, ret3m, ret6m, ret1y, rsi14 });
  const trendScore = computeTrendScore({ price: last, sma50, sma200, macdHist: m.hist, distHigh });

  // weighted Edge: 30% momentum, 25% trend, 25% value, 20% quality
  const edge = round(
    momentumScore * 0.30 +
    trendScore * 0.25 +
    valueScore * 0.25 +
    qualityScore * 0.20,
  );

  // ---- Regime z-scores: rolling Sharpe/Sortino/Omega vs own 5y history ----
  const W = { d30: 30, d90: 90, d180: 180, d365: 365 } as const;
  type WK = keyof typeof W;
  const regimeWindows: WK[] = ["d30", "d90", "d180", "d365"];

  const sharpeBy:  Record<WK, ReturnType<typeof zOfLast>> = {} as any;
  const sortinoBy: Record<WK, ReturnType<typeof zOfLast>> = {} as any;
  const omegaBy:   Record<WK, ReturnType<typeof zOfLast>> = {} as any;
  for (const k of regimeWindows) {
    const w = W[k];
    sharpeBy[k]  = zOfLast(rollingSharpe(longDailyR,  w, periodsPerYear));
    sortinoBy[k] = zOfLast(rollingSortino(longDailyR, w, periodsPerYear));
    omegaBy[k]   = zOfLast(rollingOmega(longDailyR,   w, 0));
  }

  const notes = explain({
    valueScore, qualityScore, momentumScore, trendScore,
    funds, rsi14, distHigh, priceVs50, analystUpside,
    regimeSharpeZ30: sharpeBy.d30.z,
    regimeOmegaZ30:  omegaBy.d30.z,
  });

  const insight: Insight = {
    symbol,
    asOf: Date.now(),
    price: last,
    stats: {
      ret1d, ret1m, ret3m, ret6m, ret1y,
      volAnn, sharpe: sh, sortino: so, omega: om, maxDrawdown: mdd,
      beta: b, corrSPY: corr,
    },
    signals: {
      rsi14,
      macd: m.macd,
      macdSignal: m.signal,
      macdHist: m.hist,
      bbPctB: bb?.pctB ?? null,
      bbUpper: bb?.upper ?? null,
      bbLower: bb?.lower ?? null,
      sma20,
      sma50,
      sma200,
      priceVsSma50Pct: last != null && sma50 ? ((last - sma50) / sma50) * 100 : null,
      priceVsSma200Pct: last != null && sma200 ? ((last - sma200) / sma200) * 100 : null,
      goldenCross: sma50 != null && sma200 != null ? sma50 > sma200 : null,
      deathCross: sma50 != null && sma200 != null ? sma50 < sma200 : null,
    },
    zscores: {
      priceVs50, priceVs200,
      distFrom52wHighPct: distHigh,
      distFrom52wLowPct: distLow,
      volumeZ,
    },
    expected: {
      range1mLowPct,
      range1mHighPct,
      meanReversion30dPct: meanRev,
      analystUpsidePct: analystUpside,
    },
    fundamentals: funds,
    scores: {
      value: round(valueScore),
      quality: round(qualityScore),
      momentum: round(momentumScore),
      trend: round(trendScore),
      edge,
      notes,
    },
    regime: {
      historyDays: longCloses.length,
      windows: regimeWindows,
      sharpe: sharpeBy,
      sortino: sortinoBy,
      omega: omegaBy,
    },
  };

  CACHE.set(symbol, { ts: Date.now(), data: insight });
  return insight;
}

function round(x: number) { return Math.round(x); }

function computeValueScore(f: Fundamentals | null): number {
  if (!f) return 50;
  const parts: number[] = [];
  if (f.trailingPE != null && f.trailingPE > 0) parts.push(score(f.trailingPE, 50, 8));
  if (f.forwardPE != null && f.forwardPE > 0) parts.push(score(f.forwardPE, 40, 8));
  if (f.priceToSales != null && f.priceToSales > 0) parts.push(score(f.priceToSales, 20, 1));
  if (f.priceToBook != null && f.priceToBook > 0) parts.push(score(f.priceToBook, 15, 1));
  if (f.evToEbitda != null && f.evToEbitda > 0) parts.push(score(f.evToEbitda, 30, 6));
  if (f.peg != null && f.peg > 0) parts.push(score(f.peg, 4, 0.5));
  if (!parts.length) return 50;
  return mean(parts);
}

function computeQualityScore(f: Fundamentals | null): number {
  if (!f) return 50;
  const parts: number[] = [];
  if (f.returnOnEquity != null) parts.push(score(f.returnOnEquity, -0.05, 0.30));
  if (f.profitMargin != null) parts.push(score(f.profitMargin, -0.05, 0.25));
  if (f.operatingMargin != null) parts.push(score(f.operatingMargin, -0.05, 0.30));
  if (f.grossMargin != null) parts.push(score(f.grossMargin, 0.10, 0.65));
  if (f.debtToEquity != null) parts.push(score(f.debtToEquity, 250, 20));
  if (f.currentRatio != null) parts.push(score(f.currentRatio, 0.5, 2.5));
  if (f.revenueGrowth != null) parts.push(score(f.revenueGrowth, -0.05, 0.30));
  if (!parts.length) return 50;
  return mean(parts);
}

function computeMomentumScore(x: {
  ret1m: number | null; ret3m: number | null; ret6m: number | null; ret1y: number | null;
  rsi14: number | null;
}): number {
  const parts: number[] = [];
  if (x.ret1m != null) parts.push(score(x.ret1m, -10, 15));
  if (x.ret3m != null) parts.push(score(x.ret3m, -20, 30));
  if (x.ret6m != null) parts.push(score(x.ret6m, -30, 45));
  if (x.ret1y != null) parts.push(score(x.ret1y, -40, 60));
  // RSI: best around 55-70 (strong but not exhausted)
  if (x.rsi14 != null) parts.push(score(x.rsi14, 30, 65));
  if (!parts.length) return 50;
  return mean(parts);
}

function computeTrendScore(x: {
  price: number | null; sma50: number | null; sma200: number | null;
  macdHist: number | null; distHigh: number | null;
}): number {
  const parts: number[] = [];
  if (x.price != null && x.sma50 != null) parts.push(score(((x.price - x.sma50) / x.sma50) * 100, -10, 10));
  if (x.price != null && x.sma200 != null) parts.push(score(((x.price - x.sma200) / x.sma200) * 100, -20, 25));
  if (x.sma50 != null && x.sma200 != null) parts.push(x.sma50 > x.sma200 ? 75 : 25);
  if (x.macdHist != null) parts.push(x.macdHist > 0 ? 70 : 30);
  // distFrom52wHigh: 0% (at high) is strong; -50% is weak
  if (x.distHigh != null) parts.push(score(x.distHigh, -50, 0));
  if (!parts.length) return 50;
  return mean(parts);
}

function explain(x: {
  valueScore: number; qualityScore: number; momentumScore: number; trendScore: number;
  funds: Fundamentals | null; rsi14: number | null; distHigh: number | null;
  priceVs50: number | null; analystUpside: number | null;
  regimeSharpeZ30: number | null;
  regimeOmegaZ30: number | null;
}): string[] {
  const out: string[] = [];
  if (x.priceVs50 != null && x.priceVs50 <= -1.8) out.push(`Price is ${Math.abs(x.priceVs50).toFixed(1)}σ below 50d mean — statistical extreme.`);
  if (x.priceVs50 != null && x.priceVs50 >= 1.8) out.push(`Price is ${x.priceVs50.toFixed(1)}σ above 50d mean — extended.`);
  if (x.rsi14 != null && x.rsi14 < 30) out.push(`RSI ${x.rsi14.toFixed(0)} — oversold zone.`);
  if (x.rsi14 != null && x.rsi14 > 70) out.push(`RSI ${x.rsi14.toFixed(0)} — overbought zone.`);
  if (x.distHigh != null && x.distHigh > -3) out.push(`Within 3% of 52w high — momentum confirmation.`);
  if (x.distHigh != null && x.distHigh < -25) out.push(`>25% off 52w high — value or broken trend?`);
  if (x.analystUpside != null && x.analystUpside > 25) out.push(`Analyst consensus implies ${x.analystUpside.toFixed(0)}% upside.`);
  if (x.analystUpside != null && x.analystUpside < -10) out.push(`Trades above analyst consensus by ${Math.abs(x.analystUpside).toFixed(0)}%.`);
  if (x.qualityScore >= 75) out.push("High-quality balance sheet & margins.");
  if (x.qualityScore <= 35) out.push("Quality screen flags weak margins / leverage.");
  if (x.valueScore >= 70 && x.qualityScore >= 60) out.push("Cheap + high-quality combo — classic GARP setup.");
  if (x.momentumScore >= 75 && x.trendScore >= 70) out.push("Strong trend + momentum — ride-the-leader pattern.");
  if (x.momentumScore <= 30 && x.valueScore >= 70) out.push("Beaten-down value — needs catalyst.");
  // Regime-aware notes — these are the "edges no one else sees"
  if (x.regimeSharpeZ30 != null && x.regimeSharpeZ30 >= 2.0)
    out.push(`30d Sharpe is +${x.regimeSharpeZ30.toFixed(1)}σ vs own 5y — top ~2.5% of regimes for this name.`);
  if (x.regimeSharpeZ30 != null && x.regimeSharpeZ30 <= -2.0)
    out.push(`30d Sharpe is ${x.regimeSharpeZ30.toFixed(1)}σ vs own 5y — bottom ~2.5% of regimes; possible regime change.`);
  if (x.regimeOmegaZ30 != null && x.regimeOmegaZ30 >= 1.5 && x.regimeSharpeZ30 != null && x.regimeSharpeZ30 >= 1.5)
    out.push("Sharpe AND Omega 30d z-scores both >+1.5σ — joint signal of unusual upside-skew regime.");
  return out;
}
