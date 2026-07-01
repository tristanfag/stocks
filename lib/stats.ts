// Pure-TS statistics helpers used across the insight + trend + edge layers.

export function mean(xs: number[]): number {
  if (!xs.length) return NaN;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

export function stdev(xs: number[], sample = true): number {
  if (xs.length < (sample ? 2 : 1)) return NaN;
  const m = mean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) * (x - m);
  return Math.sqrt(s / (xs.length - (sample ? 1 : 0)));
}

export function zScore(x: number, xs: number[]): number | null {
  const m = mean(xs);
  const s = stdev(xs);
  if (!Number.isFinite(s) || s === 0) return null;
  return (x - m) / s;
}

export function pctChange(start: number, end: number): number | null {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start === 0) return null;
  return ((end - start) / start) * 100;
}

export function returns(prices: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    const r = (prices[i] - prices[i - 1]) / prices[i - 1];
    if (Number.isFinite(r)) out.push(r);
  }
  return out;
}

export function logReturns(prices: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    const r = Math.log(prices[i] / prices[i - 1]);
    if (Number.isFinite(r)) out.push(r);
  }
  return out;
}

export function sma(xs: number[], n: number): number[] {
  if (n <= 0 || xs.length < n) return [];
  const out: number[] = [];
  let s = 0;
  for (let i = 0; i < xs.length; i++) {
    s += xs[i];
    if (i >= n) s -= xs[i - n];
    if (i >= n - 1) out.push(s / n);
  }
  return out;
}

export function ema(xs: number[], n: number): number[] {
  if (n <= 0 || xs.length < n) return [];
  const k = 2 / (n + 1);
  const out: number[] = [];
  let prev = mean(xs.slice(0, n));
  out.push(prev);
  for (let i = n; i < xs.length; i++) {
    prev = xs[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

export function rsi(prices: number[], period = 14): number | null {
  if (prices.length < period + 1) return null;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const ch = prices[i] - prices[i - 1];
    if (ch >= 0) gain += ch; else loss -= ch;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  for (let i = period + 1; i < prices.length; i++) {
    const ch = prices[i] - prices[i - 1];
    const g = ch > 0 ? ch : 0;
    const l = ch < 0 ? -ch : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function macd(prices: number[]): { macd: number | null; signal: number | null; hist: number | null } {
  if (prices.length < 35) return { macd: null, signal: null, hist: null };
  const ema12 = ema(prices, 12);
  const ema26 = ema(prices, 26);
  // align tails
  const aligned: number[] = [];
  const offset = ema12.length - ema26.length;
  for (let i = 0; i < ema26.length; i++) aligned.push(ema12[i + offset] - ema26[i]);
  const sig = ema(aligned, 9);
  const macdNow = aligned[aligned.length - 1];
  const sigNow = sig[sig.length - 1];
  return { macd: macdNow, signal: sigNow, hist: macdNow - sigNow };
}

export function bollinger(prices: number[], n = 20, k = 2): { mid: number; upper: number; lower: number; pctB: number } | null {
  if (prices.length < n) return null;
  const window = prices.slice(-n);
  const m = mean(window);
  const s = stdev(window);
  const upper = m + k * s;
  const lower = m - k * s;
  const last = prices[prices.length - 1];
  const pctB = upper === lower ? 0.5 : (last - lower) / (upper - lower);
  return { mid: m, upper, lower, pctB };
}

export function maxDrawdown(prices: number[]): number {
  let peak = -Infinity;
  let mdd = 0;
  for (const p of prices) {
    if (p > peak) peak = p;
    const dd = (p - peak) / peak;
    if (dd < mdd) mdd = dd;
  }
  return mdd * 100; // negative number
}

// Annualised Sharpe assuming ~252 trading days for stocks, 365 for crypto.
export function sharpe(dailyReturns: number[], periodsPerYear = 252, rf = 0): number | null {
  if (dailyReturns.length < 5) return null;
  const m = mean(dailyReturns);
  const s = stdev(dailyReturns);
  if (!Number.isFinite(s) || s === 0) return null;
  const dailyRf = rf / periodsPerYear;
  return ((m - dailyRf) / s) * Math.sqrt(periodsPerYear);
}

/**
 * Annualised Sortino ratio — Sharpe variant penalising downside vol only.
 * Downside deviation per Sortino & van der Meer 1991: sqrt(Σ_{R<MAR} (R-MAR)^2 / N).
 */
export function sortino(dailyReturns: number[], periodsPerYear = 252, mar = 0): number | null {
  if (dailyReturns.length < 5) return null;
  const dailyMar = mar / periodsPerYear;
  const m = mean(dailyReturns);
  let sumSq = 0;
  for (const r of dailyReturns) {
    const d = r - dailyMar;
    if (d < 0) sumSq += d * d;
  }
  const dd = Math.sqrt(sumSq / dailyReturns.length);
  if (!Number.isFinite(dd) || dd === 0) return null;
  return ((m - dailyMar) / dd) * Math.sqrt(periodsPerYear);
}

/**
 * Omega ratio at threshold τ (default 0): Σ max(R-τ,0) / Σ max(τ-R,0).
 * Probability-weighted gain/loss ratio. >1 = more upside than downside.
 * Returns null when no downside is observed (data too short or pure up-only).
 */
export function omega(dailyReturns: number[], threshold = 0): number | null {
  if (dailyReturns.length < 10) return null;
  let gains = 0, losses = 0;
  for (const r of dailyReturns) {
    const d = r - threshold;
    if (d > 0) gains += d;
    else if (d < 0) losses += -d;
  }
  if (losses === 0) return null;
  return gains / losses;
}

/**
 * Slide a fixed-length window of daily returns through the series and
 * compute `fn` at each position. Drops null/NaN results.
 */
function rollingMetric(
  dailyReturns: number[],
  window: number,
  fn: (slice: number[]) => number | null,
): number[] {
  const out: number[] = [];
  if (dailyReturns.length < window) return out;
  for (let end = window; end <= dailyReturns.length; end++) {
    const v = fn(dailyReturns.slice(end - window, end));
    if (v != null && Number.isFinite(v)) out.push(v);
  }
  return out;
}

export function rollingSharpe(dailyReturns: number[], window: number, periodsPerYear = 252): number[] {
  return rollingMetric(dailyReturns, window, (r) => sharpe(r, periodsPerYear));
}
export function rollingSortino(dailyReturns: number[], window: number, periodsPerYear = 252): number[] {
  return rollingMetric(dailyReturns, window, (r) => sortino(r, periodsPerYear));
}
export function rollingOmega(dailyReturns: number[], window: number, threshold = 0): number[] {
  return rollingMetric(dailyReturns, window, (r) => omega(r, threshold));
}

/**
 * z-score the most recent value in `series` against the full series.
 * Returns null if too few samples or zero variance.
 */
export function zOfLast(series: number[]): { value: number | null; z: number | null; samples: number } {
  if (!series.length) return { value: null, z: null, samples: 0 };
  const last = series[series.length - 1];
  if (series.length < 30) return { value: last, z: null, samples: series.length };
  const m = mean(series);
  const s = stdev(series);
  if (!Number.isFinite(s) || s === 0) return { value: last, z: null, samples: series.length };
  return { value: last, z: (last - m) / s, samples: series.length };
}

export function annualisedVol(dailyReturns: number[], periodsPerYear = 252): number | null {
  if (dailyReturns.length < 5) return null;
  const s = stdev(dailyReturns);
  if (!Number.isFinite(s)) return null;
  return s * Math.sqrt(periodsPerYear) * 100;
}

export function correlation(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n < 5) return null;
  const ma = mean(a.slice(-n));
  const mb = mean(b.slice(-n));
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    const xa = a[a.length - n + i] - ma;
    const xb = b[b.length - n + i] - mb;
    num += xa * xb;
    da += xa * xa;
    db += xb * xb;
  }
  const denom = Math.sqrt(da * db);
  if (denom === 0) return null;
  return num / denom;
}

export function beta(stockReturns: number[], marketReturns: number[]): number | null {
  const n = Math.min(stockReturns.length, marketReturns.length);
  if (n < 20) return null;
  const a = stockReturns.slice(-n);
  const b = marketReturns.slice(-n);
  const ma = mean(a);
  const mb = mean(b);
  let cov = 0, varM = 0;
  for (let i = 0; i < n; i++) {
    cov += (a[i] - ma) * (b[i] - mb);
    varM += (b[i] - mb) * (b[i] - mb);
  }
  if (varM === 0) return null;
  return cov / varM;
}

/** One bar's ADX state — enough to classify a trend signal and detect transitions. */
export type AdxBar = {
  adx: number;
  plusDI: number;
  minusDI: number;
  rising: boolean;      // ADX higher than the bar before it
  crossedUp: boolean;   // +DI crossed above -DI on THIS bar (was <= on the prior bar)
};

/**
 * Wilder's Average Directional Index (ADX) with +DI / -DI.
 * Measures trend STRENGTH (ADX) and DIRECTION (+DI vs -DI).
 * Returns the latest bar's state AND the previous bar's state, so callers can
 * detect a signal that JUST transitioned (e.g. became a BUY only on the latest bar).
 * Needs OHLC arrays of equal length; ~2*period+3 bars minimum for `prev`.
 *
 * Conventions:
 *  - ADX > 25 = strong trend; 20-25 = emerging; < 20 = no/weak trend (range-bound).
 *  - +DI > -DI = uptrend; -DI > +DI = downtrend.
 */
export function adx(
  high: number[],
  low: number[],
  close: number[],
  period = 14,
): {
  latest: AdxBar;
  prev: AdxBar | null;
  bars: number;
} | null {
  const n = Math.min(high.length, low.length, close.length);
  if (n < 2 * period + 2) return null;

  // Per-bar True Range and directional movement (from i=1).
  const TR: number[] = [], plusDM: number[] = [], minusDM: number[] = [];
  for (let i = 1; i < n; i++) {
    const upMove = high[i] - high[i - 1];
    const downMove = low[i - 1] - low[i];
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
    TR.push(Math.max(
      high[i] - low[i],
      Math.abs(high[i] - close[i - 1]),
      Math.abs(low[i] - close[i - 1]),
    ));
  }
  if (TR.length < period + 1) return null;

  // Wilder smoothing (accumulation form): S_1 = sum(first period); S_i = S_{i-1} - S_{i-1}/period + x_i.
  const wilder = (arr: number[]): number[] => {
    const out: number[] = [];
    let s = 0;
    for (let i = 0; i < period; i++) s += arr[i];
    out.push(s);
    for (let i = period; i < arr.length; i++) {
      s = s - s / period + arr[i];
      out.push(s);
    }
    return out; // length = arr.length - period + 1
  };

  const smTR = wilder(TR);
  const smPlusDM = wilder(plusDM);
  const smMinusDM = wilder(minusDM);

  // +DI, -DI, DX at each smoothed index (the /period cancels in the ratio).
  const dx: number[] = [];
  const plusDIArr: number[] = [], minusDIArr: number[] = [];
  for (let i = 0; i < smTR.length; i++) {
    const pDI = smTR[i] === 0 ? 0 : (100 * smPlusDM[i]) / smTR[i];
    const mDI = smTR[i] === 0 ? 0 : (100 * smMinusDM[i]) / smTR[i];
    plusDIArr.push(pDI);
    minusDIArr.push(mDI);
    const sum = pDI + mDI;
    dx.push(sum === 0 ? 0 : (100 * Math.abs(pDI - mDI)) / sum);
  }
  if (dx.length < period + 1) return null;

  // ADX = Wilder-smoothed AVERAGE of DX: ADX_1 = mean(first period DX); then recursion.
  let adxVal = 0;
  for (let i = 0; i < period; i++) adxVal += dx[i];
  adxVal /= period;
  const adxArr: number[] = [adxVal];
  for (let i = period; i < dx.length; i++) {
    adxVal = (adxVal * (period - 1) + dx[i]) / period;
    adxArr.push(adxVal);
  }

  // Build a bar state at offset from the end (0 = latest, 1 = previous week).
  // adxArr and plusDIArr/minusDIArr both END on the same bar, so end-relative
  // indexing is aligned even though their start offsets differ.
  const barAt = (off: number): AdxBar | null => {
    const ai = adxArr.length - 1 - off;
    const li = plusDIArr.length - 1 - off;
    if (ai < 1 || li < 1) return null; // need one prior bar for rising + cross
    return {
      adx: adxArr[ai],
      plusDI: plusDIArr[li],
      minusDI: minusDIArr[li],
      rising: adxArr[ai] > adxArr[ai - 1],
      crossedUp: plusDIArr[li] > minusDIArr[li] && plusDIArr[li - 1] <= minusDIArr[li - 1],
    };
  };

  const latest = barAt(0);
  if (!latest) return null;
  return { latest, prev: barAt(1), bars: n };
}

// Map a value into 0..100 by linear interpolation between [bad, good]; clamps.
export function score(value: number | null | undefined, bad: number, good: number): number {
  if (value == null || !Number.isFinite(value)) return 50;
  const lo = Math.min(bad, good);
  const hi = Math.max(bad, good);
  const t = (value - bad) / (good - bad); // monotone in direction of good
  return Math.max(0, Math.min(100, t * 100));
}

// Empirical CDF rank (0..100) of x within universe.
export function pctRank(x: number | null | undefined, universe: (number | null | undefined)[]): number | null {
  if (x == null || !Number.isFinite(x)) return null;
  const valid = universe.filter((v): v is number => v != null && Number.isFinite(v));
  if (!valid.length) return null;
  let below = 0;
  for (const v of valid) if (v < x) below++;
  return (below / valid.length) * 100;
}

export function pctRankInverse(x: number | null | undefined, universe: (number | null | undefined)[]): number | null {
  const r = pctRank(x, universe);
  return r == null ? null : 100 - r;
}

// Mean-reversion: given a z-score against a window, an empirical heuristic for expected partial reversion.
// This is a crude prior: at z=±2 we assume ~30% revert in next 20 trading days; scales linearly with |z|.
export function meanReversionExpectedReturn(z: number | null, last: number, mean50: number): number | null {
  if (z == null || !Number.isFinite(z) || !Number.isFinite(last) || !Number.isFinite(mean50)) return null;
  if (Math.abs(z) < 1) return 0;
  const reversionPct = Math.min(0.4, Math.abs(z) * 0.15); // capped at 40%
  const gap = (mean50 - last) / last; // sign of expected move
  return gap * reversionPct * 100; // percent
}
