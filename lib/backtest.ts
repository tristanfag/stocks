import { getHistory, type Candle } from "./yahoo";
import { TREND_GRAPH } from "./trends";
import { sma, returns, sharpe, sortino, omega, annualisedVol, pctChange, mean } from "./stats";

// ---- Strategy parameters --------------------------------------------------
export const STRATEGY = {
  // Fresh start — portfolio inception is today's reset.
  startDate: "2026-05-09",
  startCapital: 1_163,
  rebalanceFrequencyDays: 21,            // ~monthly
  equityTopN: 8,
  spyTrendLookback: 200,                 // SMA window
  cryptoTrendLookback: 200,
  cryptoMomentumLookback: 63,            // ~3 months
  vixDefensiveThreshold: 25,
  cashWeightRiskOn: 0.10,
  cashWeightRiskOff: 0.30,
  goldWeightBase: 0.05,
  goldWeightDefensive: 0.10,
  cryptoWeightOn: 0.15,
  cryptoSplit: { btc: 0.7, eth: 0.3 },
  // Cash earns Fed funds-ish proxy; ~5% APY
  cashAnnualYield: 0.05,
  /** Ranker for the equity sleeve. "blended" = mean of Sharpe/Sortino/Omega percentile ranks. */
  ranker: "blended" as "sharpe" | "sortino" | "omega" | "blended",
  /** Weighting inside the equity sleeve. "invvol" = inverse-volatility (risk parity). */
  weighting: "invvol" as "equal" | "invvol" | "score",
  /** Weighting cap so a single name can't blow past this fraction of equity sleeve. */
  weightCap: 0.25,
  /** Window (trading days) used to compute volatility for inverse-vol weighting. */
  volWindow: 90,
};

const MACRO_SYMBOLS = ["SPY", "^VIX", "GLD", "BTC-USD", "ETH-USD"];

function dayKey(d: Date): string { return d.toISOString().slice(0, 10); }
function startOfDay(d: Date): Date { const x = new Date(d); x.setUTCHours(0,0,0,0); return x; }

// Index a Candle[] by YYYY-MM-DD for O(1) lookup; values are { close, ts }.
function indexCandles(c: Candle[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const k of c) m.set(new Date(k.t).toISOString().slice(0, 10), k.c);
  return m;
}

// Find the price at-or-before `asOfMs` (handles weekends/holidays).
function priceAtOrBefore(candles: Candle[], asOfMs: number): number | null {
  // Binary search for largest t <= asOfMs.
  let lo = 0, hi = candles.length - 1, best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (candles[mid].t <= asOfMs) { best = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  return best >= 0 ? candles[best].c : null;
}

function closesUpTo(candles: Candle[], asOfMs: number): number[] {
  const out: number[] = [];
  for (const c of candles) {
    if (c.t <= asOfMs) out.push(c.c); else break;
  }
  return out;
}

function trailingReturn(candles: Candle[], asOfMs: number, lookbackDays: number): number | null {
  const closes = closesUpTo(candles, asOfMs);
  if (closes.length < lookbackDays + 1) return null;
  return pctChange(closes[closes.length - 1 - lookbackDays], closes[closes.length - 1]);
}

function trailingSharpe(candles: Candle[], asOfMs: number, lookbackDays: number, periodsPerYear = 252): number | null {
  const closes = closesUpTo(candles, asOfMs);
  if (closes.length < lookbackDays + 1) return null;
  const slice = closes.slice(-lookbackDays - 1);
  const r = returns(slice);
  return sharpe(r, periodsPerYear);
}
function trailingSortino(candles: Candle[], asOfMs: number, lookbackDays: number, periodsPerYear = 252): number | null {
  const closes = closesUpTo(candles, asOfMs);
  if (closes.length < lookbackDays + 1) return null;
  const slice = closes.slice(-lookbackDays - 1);
  const r = returns(slice);
  return sortino(r, periodsPerYear);
}
function trailingOmega(candles: Candle[], asOfMs: number, lookbackDays: number): number | null {
  const closes = closesUpTo(candles, asOfMs);
  if (closes.length < lookbackDays + 1) return null;
  const slice = closes.slice(-lookbackDays - 1);
  const r = returns(slice);
  return omega(r, 0);
}
function trailingVol(candles: Candle[], asOfMs: number, lookbackDays: number, periodsPerYear = 252): number | null {
  const closes = closesUpTo(candles, asOfMs);
  if (closes.length < lookbackDays + 1) return null;
  const slice = closes.slice(-lookbackDays - 1);
  const r = returns(slice);
  return annualisedVol(r, periodsPerYear);
}

/** Empirical percentile rank of x within values; returns 0..100 or null. */
function percentile(x: number | null, values: number[]): number | null {
  if (x == null || !Number.isFinite(x)) return null;
  const valid = values.filter((v) => Number.isFinite(v));
  if (!valid.length) return null;
  let below = 0;
  for (const v of valid) if (v < x) below++;
  return (below / valid.length) * 100;
}

function smaAt(candles: Candle[], asOfMs: number, n: number): number | null {
  const closes = closesUpTo(candles, asOfMs);
  const smaArr = sma(closes, n);
  return smaArr.at(-1) ?? null;
}

// Generate rebalance dates: start date itself, then every first-of-month thereafter.
function monthlyRebalanceDates(startISO: string, endISO: string): Date[] {
  const start = new Date(startISO + "T00:00:00Z");
  const end = new Date(endISO + "T00:00:00Z");
  const out: Date[] = [];
  if (start <= end) out.push(new Date(start));
  // Subsequent rebalances at first-of-month strictly after start.
  let cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  while (cur <= end) {
    if (cur.getTime() !== start.getTime()) out.push(new Date(cur));
    cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1));
  }
  return out;
}

// Weekly rebalance dates: start date itself, then every Monday thereafter.
function weeklyRebalanceDates(startISO: string, endISO: string): Date[] {
  const start = new Date(startISO + "T00:00:00Z");
  const end = new Date(endISO + "T00:00:00Z");
  const out: Date[] = [];
  if (start <= end) out.push(new Date(start));
  // Subsequent: next Monday strictly after start.
  const cur = new Date(start);
  cur.setUTCDate(cur.getUTCDate() + 1);
  while (cur.getUTCDay() !== 1) cur.setUTCDate(cur.getUTCDate() + 1);
  while (cur <= end) {
    if (cur.getTime() !== start.getTime()) out.push(new Date(cur));
    cur.setUTCDate(cur.getUTCDate() + 7);
  }
  return out;
}

// ---- Horizon variants -----------------------------------------------------
export type Horizon = "short" | "medium" | "long" | "longWeekly" | "mediumWeekly" | "shortMonthly" | "longWeeklySortino";

export type HorizonConfig = {
  label: string;
  windowLabel: string;
  rankWindow: number;             // trading days for risk-adjusted ratio rankings
  rebalance: "weekly" | "monthly";
};

export const HORIZONS: Record<Horizon, HorizonConfig> = {
  short: {
    label: "Short term",
    windowLabel: "1m signal · weekly rebalance",
    rankWindow: 21,
    rebalance: "weekly",
  },
  medium: {
    label: "Medium term",
    windowLabel: "3m signal · monthly rebalance",
    rankWindow: 63,
    rebalance: "monthly",
  },
  long: {
    label: "Long term",
    windowLabel: "12m signal · monthly rebalance",
    rankWindow: 252,
    rebalance: "monthly",
  },
  longWeekly: {
    label: "Long term (weekly)",
    windowLabel: "12m signal · weekly rebalance",
    rankWindow: 252,
    rebalance: "weekly",
  },
  // Experimental — not surfaced in default UI; exposed via /api/backtest-experiment.
  mediumWeekly: {
    label: "Medium term (weekly)",
    windowLabel: "3m signal · weekly rebalance",
    rankWindow: 63,
    rebalance: "weekly",
  },
  shortMonthly: {
    label: "Short term (monthly)",
    windowLabel: "1m signal · monthly rebalance",
    rankWindow: 21,
    rebalance: "monthly",
  },
  // Aggressive headline strategy: 12m signal + weekly rebalance + Sortino-only ranker.
  longWeeklySortino: {
    label: "Long term · Sortino · weekly",
    windowLabel: "12m signal · weekly rebalance · Sortino ranker",
    rankWindow: 252,
    rebalance: "weekly",
  },
};

// ---- Result types --------------------------------------------------------
export type AssetClass = "equity" | "crypto" | "gold" | "cash";

export type AllocationLine = {
  date: string;          // YYYY-MM-DD
  totalValue: number;
  weights: Record<string, number>;       // symbol → weight (0..1), CASH for cash
  classWeights: Record<AssetClass, number>;
  regime: { spyRiskOn: boolean | null; btcRiskOn: boolean | null; vix: number | null };
  picksDetail: Array<{ symbol: string; sharpe: number; score: number; vol: number | null; weight: number }>;
};

export type EquityPoint = { date: string; value: number; spyValue: number; allCashValue: number };

export type BacktestSummary = {
  startDate: string;
  endDate: string;
  startCapital: number;
  endValue: number;
  totalReturnPct: number;
  cagrPct: number;
  maxDrawdownPct: number;
  volAnn: number;
  sharpe: number;
  spyEndValue: number;
  spyTotalReturnPct: number;
  alphaVsSpyPct: number;
};

export type TodayPortfolio = {
  asOf: string;
  shortTerm: { name: string; tagline: string; positions: Array<{ symbol: string; weight: number; rationale: string }> };
  mediumTerm: { name: string; tagline: string; positions: Array<{ symbol: string; weight: number; rationale: string }> };
  longTerm:   { name: string; tagline: string; positions: Array<{ symbol: string; weight: number; rationale: string }> };
};

export type BacktestRun = {
  horizon: Horizon;
  config: HorizonConfig;
  equityCurve: EquityPoint[];
  allocations: AllocationLine[];
  summary: BacktestSummary;
};

export type BacktestReport = {
  asOf: number;
  strategy: typeof STRATEGY;
  runs: {
    short: BacktestRun;
    medium: BacktestRun;
    long: BacktestRun;
    longWeekly: BacktestRun;
    longWeeklySortino: BacktestRun;
  };
  today: TodayPortfolio;
};

const CACHE: { ts: number; data: BacktestReport | null } = { ts: 0, data: null };
const TTL_MS = 30 * 60 * 1000;

// ---- Main entry point ----------------------------------------------------
export async function buildBacktest(force = false): Promise<BacktestReport> {
  if (!force && CACHE.data && Date.now() - CACHE.ts < TTL_MS) return CACHE.data;

  const equitySet = new Set<string>();
  for (const node of Object.values(TREND_GRAPH)) for (const s of node.symbols) equitySet.add(s);
  const equities = Array.from(equitySet);
  const allSymbols = Array.from(new Set([...equities, ...MACRO_SYMBOLS]));

  // Fetch 5y daily history for everything (cached after first call).
  const histPairs = await Promise.all(
    allSymbols.map(async (s) => [s, await getHistory(s, "5y")] as const),
  );
  const histories = new Map<string, Candle[]>(histPairs);

  // Run all five horizon variants on the same data.
  const today = new Date();
  const runs = {
    short:             await simulate("short",             histories, equities, today),
    medium:            await simulate("medium",            histories, equities, today),
    long:              await simulate("long",              histories, equities, today),
    longWeekly:        await simulate("longWeekly",        histories, equities, today),
    // Aggressive: longWeekly horizon with Sortino-only ranker (best raw return in our grid).
    longWeeklySortino: await simulate("longWeeklySortino", histories, equities, today, "sortino"),
  };

  const finalMs = today.getTime();
  const todayPortfolio = computeTodayPortfolio(finalMs, histories, equities);

  const report: BacktestReport = {
    asOf: Date.now(),
    strategy: STRATEGY,
    runs,
    today: todayPortfolio,
  };
  CACHE.ts = Date.now();
  CACHE.data = report;
  return report;
}

/**
 * Compute today's target allocation for every standard horizon variant — fast
 * (no historical walk). Used for "what to buy today with capital X" snapshots.
 */
export type TodayAllocation = {
  horizon: Horizon;
  config: HorizonConfig;
  ranker: typeof STRATEGY.ranker;
  weights: Record<string, number>;
  classWeights: Record<AssetClass, number>;
  regime: { spyRiskOn: boolean | null; btcRiskOn: boolean | null; vix: number | null; cryptoForced: boolean };
  picks: Array<{ symbol: string; weight: number; score: number; vol: number | null }>;
};

const STANDARD_TODAY_VARIANTS: Array<{ horizon: Horizon; ranker?: typeof STRATEGY.ranker }> = [
  { horizon: "short" },
  { horizon: "medium" },
  { horizon: "long" },
  { horizon: "longWeekly" },
  { horizon: "longWeeklySortino", ranker: "sortino" },
];

export async function computeTodayAllocations(opts: { capital: number; forceCryptoOn?: boolean }): Promise<{
  asOf: number;
  asOfDate: string;
  capital: number;
  cryptoForced: boolean;
  variants: TodayAllocation[];
}> {
  const equitySet = new Set<string>();
  for (const node of Object.values(TREND_GRAPH)) for (const s of node.symbols) equitySet.add(s);
  const equities = Array.from(equitySet);
  const allSymbols = Array.from(new Set([...equities, ...MACRO_SYMBOLS]));
  const histPairs = await Promise.all(allSymbols.map(async (s) => [s, await getHistory(s, "5y")] as const));
  const histories = new Map<string, Candle[]>(histPairs);
  const today = new Date();
  const todayMs = today.getTime();
  const force = !!opts.forceCryptoOn;

  const variants: TodayAllocation[] = [];
  for (const v of STANDARD_TODAY_VARIANTS) {
    const cfg = HORIZONS[v.horizon];
    const ranker = v.ranker ?? STRATEGY.ranker;
    const target = computeAllocation(todayMs, histories, equities, cfg.rankWindow, ranker, force);
    variants.push({
      horizon: v.horizon,
      config: cfg,
      ranker,
      weights: target.weights,
      classWeights: target.classWeights,
      regime: { ...target.regime, cryptoForced: force },
      picks: target.picksDetail.map((p) => ({ symbol: p.symbol, weight: p.weight, score: p.score, vol: p.vol })),
    });
  }
  return { asOf: todayMs, asOfDate: dayKey(today), capital: opts.capital, cryptoForced: force, variants };
}

/**
 * Run a single ad-hoc simulation. Loads its own histories. Used by the
 * experimental endpoint to A/B-test alternative configs without disturbing
 * the cached headline backtest.
 */
export async function runOneOff(opts: { horizon: Horizon; ranker?: typeof STRATEGY.ranker }): Promise<BacktestRun> {
  const equitySet = new Set<string>();
  for (const node of Object.values(TREND_GRAPH)) for (const s of node.symbols) equitySet.add(s);
  const equities = Array.from(equitySet);
  const allSymbols = Array.from(new Set([...equities, ...MACRO_SYMBOLS]));
  const histPairs = await Promise.all(allSymbols.map(async (s) => [s, await getHistory(s, "5y")] as const));
  const histories = new Map<string, Candle[]>(histPairs);
  return simulate(opts.horizon, histories, equities, new Date(), opts.ranker);
}

/**
 * User overrides — manual position swaps applied AFTER the engine computes its target.
 *
 * REVERTED 2026-05-19: previously swapped cash+gold for CEG+CRWD. Today's analysis
 * flagged CEG as a SELL (trend score 17, regime degrading: -11.6% 1d, -9.6% 1m) and
 * CRWD as parabolic-veto SELL (RSI 86, z(50d) +2.83σ, +15.3% 1d). With the market
 * correcting broadly today (25 SELLs vs 8 last week), the defensive cash+gold sleeve
 * is the right posture again. Override disabled.
 */
function applyUserOverride(
  horizon: Horizon,
  target: ReturnType<typeof computeAllocation>,
): ReturnType<typeof computeAllocation> {
  return target;
}

async function simulate(
  horizon: Horizon,
  histories: Map<string, Candle[]>,
  equities: string[],
  today: Date,
  rankerOverride?: typeof STRATEGY.ranker,
): Promise<BacktestRun> {
  const cfg = HORIZONS[horizon];
  const ranker = rankerOverride ?? STRATEGY.ranker;
  const startMs = new Date(STRATEGY.startDate + "T00:00:00Z").getTime();
  const endISO = dayKey(today);
  const rebalanceDates =
    cfg.rebalance === "weekly"
      ? weeklyRebalanceDates(STRATEGY.startDate, endISO)
      : monthlyRebalanceDates(STRATEGY.startDate, endISO);

  let cash = STRATEGY.startCapital;
  let holdings: Record<string, number> = {};
  const equityCurve: EquityPoint[] = [];
  const allocations: AllocationLine[] = [];

  const spyHist = histories.get("SPY") ?? [];
  const spyStart = priceAtOrBefore(spyHist, startMs) ?? 1;
  const spyShares = STRATEGY.startCapital / spyStart;

  let prevDateMs = startMs;

  for (const dt of rebalanceDates) {
    const dtMs = dt.getTime();

    // mark-to-market
    let portValue = cash;
    for (const [sym, shares] of Object.entries(holdings)) {
      const px = priceAtOrBefore(histories.get(sym) ?? [], dtMs) ?? 0;
      portValue += shares * px;
    }
    if (cash > 0 && prevDateMs < dtMs) {
      const days = (dtMs - prevDateMs) / (24 * 3600 * 1000);
      portValue += cash * (STRATEGY.cashAnnualYield * days / 365);
    }

    // compute target allocation using only data ≤ dtMs
    const target = applyUserOverride(horizon, computeAllocation(dtMs, histories, equities, cfg.rankWindow, ranker));

    // re-balance
    const newHoldings: Record<string, number> = {};
    let cashAlloc = 0;
    for (const [sym, w] of Object.entries(target.weights)) {
      const dollars = portValue * w;
      if (sym === "CASH") { cashAlloc += dollars; continue; }
      const px = priceAtOrBefore(histories.get(sym) ?? [], dtMs);
      if (!px || px <= 0) { cashAlloc += dollars; continue; }
      newHoldings[sym] = dollars / px;
    }
    cash = cashAlloc;
    holdings = newHoldings;
    prevDateMs = dtMs;

    const spyPx = priceAtOrBefore(spyHist, dtMs) ?? spyStart;
    const allCashValue = STRATEGY.startCapital * Math.pow(1 + STRATEGY.cashAnnualYield, (dtMs - startMs) / (365 * 24 * 3600 * 1000));

    equityCurve.push({
      date: dayKey(dt),
      value: portValue,
      spyValue: spyShares * spyPx,
      allCashValue,
    });
    allocations.push({
      date: dayKey(dt),
      totalValue: portValue,
      weights: target.weights,
      classWeights: target.classWeights,
      regime: target.regime,
      picksDetail: target.picksDetail,
    });
  }

  // final mark-to-market at "today"
  const finalMs = today.getTime();
  let finalValue = cash;
  for (const [sym, shares] of Object.entries(holdings)) {
    const px = priceAtOrBefore(histories.get(sym) ?? [], finalMs) ?? 0;
    finalValue += shares * px;
  }
  if (cash > 0) {
    const days = (finalMs - prevDateMs) / (24 * 3600 * 1000);
    finalValue += cash * (STRATEGY.cashAnnualYield * days / 365);
  }
  const spyFinalPx = priceAtOrBefore(spyHist, finalMs) ?? spyStart;
  const allCashFinal = STRATEGY.startCapital * Math.pow(1 + STRATEGY.cashAnnualYield, (finalMs - startMs) / (365 * 24 * 3600 * 1000));
  equityCurve.push({
    date: dayKey(today),
    value: finalValue,
    spyValue: spyShares * spyFinalPx,
    allCashValue: allCashFinal,
  });

  // summary stats — annualisation factor depends on rebalance cadence
  const periodsPerYear = cfg.rebalance === "weekly" ? 52 : 12;
  const yearsElapsed = (finalMs - startMs) / (365.25 * 24 * 3600 * 1000);
  const totalReturn = (finalValue / STRATEGY.startCapital - 1) * 100;
  const cagr = (Math.pow(finalValue / STRATEGY.startCapital, 1 / Math.max(yearsElapsed, 1e-9)) - 1) * 100;
  const periodValues = equityCurve.map((p) => p.value);
  const periodR = returns(periodValues);
  const m = periodR.length ? periodR.reduce((a, x) => a + x, 0) / periodR.length : 0;
  const variance = periodR.length > 1
    ? periodR.reduce((a, x) => a + (x - m) ** 2, 0) / (periodR.length - 1)
    : 0;
  const volAnn = Math.sqrt(variance) * Math.sqrt(periodsPerYear) * 100;

  let peak = -Infinity, mdd = 0;
  for (const v of periodValues) {
    if (v > peak) peak = v;
    if (peak > 0) {
      const dd = (v - peak) / peak;
      if (dd < mdd) mdd = dd;
    }
  }
  const sharpeAnn = sharpe(periodR, periodsPerYear) ?? 0;
  const spyEnd = spyShares * spyFinalPx;
  const spyTotalReturn = (spyEnd / STRATEGY.startCapital - 1) * 100;

  const summary: BacktestSummary = {
    startDate: STRATEGY.startDate,
    endDate: dayKey(today),
    startCapital: STRATEGY.startCapital,
    endValue: finalValue,
    totalReturnPct: totalReturn,
    cagrPct: cagr,
    maxDrawdownPct: mdd * 100,
    volAnn,
    sharpe: sharpeAnn,
    spyEndValue: spyEnd,
    spyTotalReturnPct: spyTotalReturn,
    alphaVsSpyPct: totalReturn - spyTotalReturn,
  };

  return { horizon, config: cfg, equityCurve, allocations, summary };
}

// ---- Allocation rule ----------------------------------------------------
function computeAllocation(
  asOfMs: number,
  histories: Map<string, Candle[]>,
  equities: string[],
  rankWindow: number = 252,
  ranker: typeof STRATEGY.ranker = STRATEGY.ranker,
  forceCryptoOn: boolean = false,
): {
  weights: Record<string, number>;
  classWeights: Record<AssetClass, number>;
  regime: { spyRiskOn: boolean | null; btcRiskOn: boolean | null; vix: number | null };
  picksDetail: Array<{ symbol: string; sharpe: number; score: number; vol: number | null; weight: number }>;
} {
  const spy = histories.get("SPY") ?? [];
  const vix = histories.get("^VIX") ?? [];
  const btc = histories.get("BTC-USD") ?? [];

  const spyPx = priceAtOrBefore(spy, asOfMs);
  const spy200 = smaAt(spy, asOfMs, STRATEGY.spyTrendLookback);
  const spyRiskOn = spyPx != null && spy200 != null ? spyPx > spy200 : null;

  const btcPx = priceAtOrBefore(btc, asOfMs);
  const btc200 = smaAt(btc, asOfMs, STRATEGY.cryptoTrendLookback);
  const btc3m = trailingReturn(btc, asOfMs, STRATEGY.cryptoMomentumLookback);
  const btcRiskOn = btcPx != null && btc200 != null
    ? btcPx > btc200 && (btc3m ?? 0) > 0
    : null;

  const vixVal = priceAtOrBefore(vix, asOfMs);
  const isDefensive = vixVal != null && vixVal > STRATEGY.vixDefensiveThreshold;

  const cashWeight = (spyRiskOn === false) ? STRATEGY.cashWeightRiskOff : STRATEGY.cashWeightRiskOn;
  const goldWeight = isDefensive ? STRATEGY.goldWeightDefensive : STRATEGY.goldWeightBase;
  const cryptoWeight = (forceCryptoOn || btcRiskOn === true) ? STRATEGY.cryptoWeightOn : 0;
  const equityWeight = Math.max(0, 1 - cashWeight - goldWeight - cryptoWeight);

  // ---- Rank equities by composite of risk-adjusted return ratios ---------
  // Filter: must have ≥(rankWindow+1) bars AND be above SMA200 (no falling knives).
  type Cand = { symbol: string; sharpe: number | null; sortino: number | null; omega: number | null; vol: number | null };
  const candidates: Cand[] = [];
  for (const sym of equities) {
    const h = histories.get(sym);
    if (!h || h.length < Math.max(rankWindow + 1, 200)) continue;
    const px = priceAtOrBefore(h, asOfMs);
    const sma200v = smaAt(h, asOfMs, 200);
    if (px == null || sma200v == null || px <= sma200v) continue;
    candidates.push({
      symbol: sym,
      sharpe:  trailingSharpe(h,  asOfMs, rankWindow),
      sortino: trailingSortino(h, asOfMs, rankWindow),
      omega:   trailingOmega(h,   asOfMs, rankWindow),
      vol:     trailingVol(h,     asOfMs, STRATEGY.volWindow),
    });
  }
  // Score each candidate per the configured ranker.
  const sharpeUniverse  = candidates.map((c) => c.sharpe).filter((x): x is number => x != null);
  const sortinoUniverse = candidates.map((c) => c.sortino).filter((x): x is number => x != null);
  const omegaUniverse   = candidates.map((c) => c.omega).filter((x): x is number => x != null);
  type Scored = Cand & { score: number };
  const scored: Scored[] = candidates.map((c) => {
    let score = 0;
    if (ranker === "sharpe")       score = c.sharpe  ?? -Infinity;
    else if (ranker === "sortino") score = c.sortino ?? -Infinity;
    else if (ranker === "omega")   score = c.omega   ?? -Infinity;
    else {
      // blended: average of Sharpe/Sortino/Omega percentile ranks
      const ranks: number[] = [];
      const ps = percentile(c.sharpe,  sharpeUniverse);  if (ps != null) ranks.push(ps);
      const po = percentile(c.sortino, sortinoUniverse); if (po != null) ranks.push(po);
      const pw = percentile(c.omega,   omegaUniverse);   if (pw != null) ranks.push(pw);
      score = ranks.length ? mean(ranks) : -Infinity;
    }
    return { ...c, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const picks = scored.slice(0, STRATEGY.equityTopN);

  // ---- Compute weights inside the equity sleeve --------------------------
  const sleeveWeights = computeSleeveWeights(picks, equityWeight);

  const weights: Record<string, number> = {};
  weights["CASH"] = cashWeight;
  if (goldWeight > 0) weights["GLD"] = goldWeight;
  if (cryptoWeight > 0) {
    weights["BTC-USD"] = cryptoWeight * STRATEGY.cryptoSplit.btc;
    weights["ETH-USD"] = cryptoWeight * STRATEGY.cryptoSplit.eth;
  }
  if (picks.length === 0) {
    weights["CASH"] = (weights["CASH"] ?? 0) + equityWeight;
  } else {
    for (const p of picks) weights[p.symbol] = sleeveWeights[p.symbol] ?? 0;
  }

  const classWeights: Record<AssetClass, number> = {
    equity: equityWeight,
    crypto: cryptoWeight,
    gold: goldWeight,
    cash: cashWeight,
  };

  return {
    weights,
    classWeights,
    regime: { spyRiskOn, btcRiskOn, vix: vixVal },
    picksDetail: picks.map((p) => ({
      symbol: p.symbol,
      sharpe: p.sharpe ?? 0,
      score: p.score,
      vol: p.vol ?? null,
      weight: sleeveWeights[p.symbol] ?? 0,
    })),
  };
}

/**
 * Apply the configured weighting scheme inside the equity sleeve.
 * Always normalises to total = sleeveWeight; respects per-position cap
 * by iteratively clipping & redistributing.
 */
function computeSleeveWeights(
  picks: Array<{ symbol: string; vol: number | null; score: number }>,
  sleeveWeight: number,
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!picks.length || sleeveWeight <= 0) return out;

  let raw: Array<{ symbol: string; raw: number }>;
  if (STRATEGY.weighting === "invvol") {
    // Use a fallback vol when missing so we don't drop picks.
    const fallbackVol = 35;
    raw = picks.map((p) => ({ symbol: p.symbol, raw: 1 / Math.max(5, p.vol ?? fallbackVol) }));
  } else if (STRATEGY.weighting === "score") {
    // For score-weighting, shift to non-negative space first so weights are positive.
    const minScore = Math.min(...picks.map((p) => p.score));
    const shifted = picks.map((p) => Math.max(0.01, p.score - minScore + 0.5));
    raw = picks.map((p, i) => ({ symbol: p.symbol, raw: shifted[i] }));
  } else {
    raw = picks.map((p) => ({ symbol: p.symbol, raw: 1 }));
  }

  // Normalise to sleeveWeight and apply cap with iterative clipping.
  const cap = sleeveWeight * STRATEGY.weightCap;
  let weights = normalise(raw, sleeveWeight);
  for (let iter = 0; iter < 5; iter++) {
    let excess = 0;
    let uncappedCount = 0;
    for (const r of raw) {
      if (weights[r.symbol] > cap) {
        excess += weights[r.symbol] - cap;
        weights[r.symbol] = cap;
      } else {
        uncappedCount++;
      }
    }
    if (excess <= 1e-9 || uncappedCount === 0) break;
    // Redistribute excess proportionally among uncapped picks.
    const uncapped = raw.filter((r) => weights[r.symbol] < cap - 1e-9);
    const sumUncapped = uncapped.reduce((s, r) => s + r.raw, 0);
    for (const r of uncapped) {
      weights[r.symbol] += excess * (r.raw / sumUncapped);
    }
  }
  for (const r of raw) out[r.symbol] = weights[r.symbol];
  return out;
}

function normalise(raw: Array<{ symbol: string; raw: number }>, total: number): Record<string, number> {
  const sum = raw.reduce((a, x) => a + x.raw, 0);
  const out: Record<string, number> = {};
  if (sum <= 0) {
    for (const r of raw) out[r.symbol] = total / raw.length;
    return out;
  }
  for (const r of raw) out[r.symbol] = (r.raw / sum) * total;
  return out;
}

// ---- Today's preferred portfolio ----------------------------------------
/**
 * Today's preferred portfolio: now uses the SAME engine as the strategy backtest,
 * one bucket per core horizon. This guarantees parity between the "Current portfolio"
 * card (last rebalance of selected strategy) and these buckets (today's allocation
 * for each strategy variant). Stale-divergence between the two views is gone.
 */
function computeTodayPortfolio(
  asOfMs: number,
  histories: Map<string, Candle[]>,
  equities: string[],
): TodayPortfolio {
  const buildBucket = (
    name: string,
    tagline: string,
    rankWindow: number,
    ranker: typeof STRATEGY.ranker,
  ) => {
    const target = computeAllocation(asOfMs, histories, equities, rankWindow, ranker);
    const positions = Object.entries(target.weights)
      .filter(([, w]) => w > 0.001)
      .sort((a, b) => b[1] - a[1])
      .map(([symbol, weight]) => {
        const detail = target.picksDetail.find((p) => p.symbol === symbol);
        const rationale = symbol === "CASH"
          ? "cash sleeve (regime-driven)"
          : symbol === "GLD"
          ? "gold sleeve (5% baseline / 10% defensive)"
          : symbol === "BTC-USD" || symbol === "ETH-USD"
          ? "crypto sleeve (BTC > 200d AND 3m > 0)"
          : detail
          ? `score ${detail.score.toFixed(0)} · vol ${detail.vol?.toFixed(0) ?? "—"}%`
          : "";
        return { symbol, weight, rationale };
      });
    return { name, tagline, positions };
  };

  return {
    asOf: dayKey(new Date(asOfMs)),
    shortTerm: buildBucket(
      "Short term",
      "1m signal · weekly cadence · blended ranker · matches Short strategy",
      21,
      "blended",
    ),
    mediumTerm: buildBucket(
      "Medium term",
      "3m signal · monthly cadence · blended ranker · matches Medium strategy",
      63,
      "blended",
    ),
    longTerm: buildBucket(
      "Long term",
      "12m signal · monthly cadence · blended ranker · matches Long strategy",
      252,
      "blended",
    ),
  };
}
