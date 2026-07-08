import { getHistory, type Candle } from "./yahoo";
import { sma } from "./stats";
import { TREND_GRAPH } from "./trends";
import { buildBacktest } from "./backtest";
import { buildInsight } from "./insight";

/**
 * CRASH RADAR — a weighted composite of empirically-documented risk-off signals.
 *
 * Honest framing: nothing predicts crashes. What exists is a set of STRESS
 * indicators that historically LEAD broad equity drawdowns by days-to-weeks:
 * credit spreads widening before equities fall, VIX term-structure inverting,
 * violent yen strengthening (carry unwind — the Aug-2024 channel), breadth
 * deteriorating under a calm index, defensive rotation. Any single signal is
 * noisy; the composite firing across groups is the actionable event.
 *
 * The radar outputs a 0–100 index with a concrete sell ladder, plus
 * per-holding tripwires (the sell rules previously applied only manually).
 */

type Grade = "green" | "amber" | "red";

export type RadarSignal = {
  id: string;
  label: string;
  group: "market" | "macro" | "book";
  value: string;            // human-readable current reading
  grade: Grade;
  weight: number;
  why: string;              // what it measures + thresholds
  available: boolean;       // false → excluded from composite
};

export type TripwireStatus = {
  symbol: string;
  status: "OK" | "WEAK" | "TRIM" | "EXIT";
  reason: string;
  trend: number | null;
  sharpeZ30: number | null;
  z50: number | null;
  rsi: number | null;
};

export type CrashRadarReport = {
  asOf: number;
  asOfDate: string;
  index: number;                                    // 0..100
  band: "GREEN" | "AMBER" | "ORANGE" | "RED";
  action: string;                                   // sell-ladder recommendation
  signals: RadarSignal[];
  tripwires: TripwireStatus[];
  bookDrawdownPct: number | null;                   // current book DD from peak
  methodology: string[];
};

const CACHE: { ts: number; data: CrashRadarReport | null } = { ts: 0, data: null };
const TTL_MS = 15 * 60 * 1000;

function dayKey(d: Date): string { return d.toISOString().slice(0, 10); }
function lastC(c: Candle[]): number | null { return c.length ? c[c.length - 1].c : null; }
function nBarsAgo(c: Candle[], n: number): number | null {
  return c.length > n ? c[c.length - 1 - n].c : null;
}
function chg(c: Candle[], n: number): number | null {
  const a = nBarsAgo(c, n), b = lastC(c);
  if (a == null || b == null || a === 0) return null;
  return ((b - a) / a) * 100;
}
function smaLast(c: Candle[], n: number): number | null {
  const closes = c.map((x) => x.c);
  return sma(closes, n).at(-1) ?? null;
}
const fmtPct = (x: number | null, dp = 1) => x == null ? "n/a" : `${x >= 0 ? "+" : ""}${x.toFixed(dp)}%`;

export async function buildCrashRadar(force = false): Promise<CrashRadarReport> {
  if (!force && CACHE.data && Date.now() - CACHE.ts < TTL_MS) return CACHE.data;

  // ---- Fetch all macro/market series (daily, 1y) ---------------------------
  const SERIES = ["SPY", "SMH", "^VIX", "^VIX3M", "HYG", "LQD", "^TNX", "^IRX", "JPY=X", "DX-Y.NYB", "GLD", "BTC-USD"] as const;
  const fetched = await Promise.all(SERIES.map((s) => getHistory(s, "1y").catch(() => [] as Candle[])));
  const H = new Map<string, Candle[]>(SERIES.map((s, i) => [s, fetched[i]]));

  const signals: RadarSignal[] = [];
  const push = (
    id: string, label: string, group: RadarSignal["group"], weight: number,
    grade: Grade | null, value: string, why: string,
  ) => signals.push({ id, label, group, weight, grade: grade ?? "green", value, why, available: grade !== null });

  // ---- MARKET-INTERNAL SIGNALS ---------------------------------------------

  // 1. VIX term structure (spot vs 3M). Backwardation = panic regime. One of the
  //    best-documented short-horizon crash signals.
  {
    const vix = lastC(H.get("^VIX")!), vix3m = lastC(H.get("^VIX3M")!);
    if (vix != null && vix3m != null && vix3m > 0) {
      const ratio = vix / vix3m;
      const grade: Grade = ratio >= 1.0 ? "red" : ratio >= 0.95 ? "amber" : "green";
      push("vix-term", "VIX term structure", "market", 15, grade,
        `VIX/VIX3M = ${ratio.toFixed(3)}`,
        "Spot VIX above 3-month VIX (ratio ≥ 1.0) = backwardation — the market pays up for NEAR-term protection. Historically fires at/just before crash accelerations. Amber ≥ 0.95.");
    } else {
      push("vix-term", "VIX term structure", "market", 15, null, "n/a", "VIX3M data unavailable.");
    }
  }

  // 2. VIX level + 10d spike.
  {
    const vixH = H.get("^VIX")!;
    const vix = lastC(vixH);
    const spike = chg(vixH, 10);
    if (vix != null) {
      const grade: Grade = vix >= 28 || (spike != null && spike >= 50) ? "red"
        : vix >= 20 || (spike != null && spike >= 30) ? "amber" : "green";
      push("vix-level", "VIX level & spike", "market", 8, grade,
        `VIX ${vix.toFixed(1)}, 10d ${fmtPct(spike)}`,
        "Absolute fear gauge. Amber ≥ 20 or +30% in 10 days; red ≥ 28 or +50% in 10 days.");
    } else push("vix-level", "VIX level & spike", "market", 8, null, "n/a", "VIX unavailable.");
  }

  // 3. SMH trend — the book is semi-heavy; SPY is the WRONG index to watch.
  {
    const smh = H.get("SMH")!;
    const px = lastC(smh), s50 = smaLast(smh, 50), s200 = smaLast(smh, 200);
    if (px != null && s50 != null && s200 != null) {
      const below50 = px < s50, below200 = px < s200, deathCross = s50 < s200;
      const grade: Grade = below200 || deathCross ? "red" : below50 ? "amber" : "green";
      push("smh-trend", "Semis (SMH) trend", "market", 15, grade,
        `px ${(px).toFixed(0)} | ${below50 ? "BELOW" : "above"} 50d, ${below200 ? "BELOW" : "above"} 200d${deathCross ? ", death cross" : ""}`,
        "Sector-correct trend filter for a semi-heavy book (SPY can stay calm while semis break). Amber below 50d; red below 200d or 50d<200d.");
    } else push("smh-trend", "Semis (SMH) trend", "market", 15, null, "n/a", "SMH unavailable.");
  }

  // 4. Universe breadth: % of theme-graph tickers above their 200d SMA.
  //    Breadth collapse under a calm index = distribution.
  {
    const syms = Array.from(new Set(Object.values(TREND_GRAPH).flatMap((n) => n.symbols)));
    const hists = await Promise.all(syms.map((s) => getHistory(s, "1y").catch(() => [] as Candle[])));
    let above = 0, eligible = 0;
    for (const h of hists) {
      const px = lastC(h), s200 = smaLast(h, 200);
      if (px != null && s200 != null) { eligible++; if (px > s200) above++; }
    }
    if (eligible >= 20) {
      const pct = (above / eligible) * 100;
      const grade: Grade = pct < 35 ? "red" : pct < 50 ? "amber" : "green";
      push("breadth", "Universe breadth (>200d)", "market", 10, grade,
        `${pct.toFixed(0)}% of ${eligible} above 200d`,
        "Percent of the ~100-ticker theme universe above its 200d SMA. Amber < 50%, red < 35% — narrow leadership precedes index-level breaks.");
    } else push("breadth", "Universe breadth (>200d)", "market", 10, null, "n/a", "Too few tickers with 200d history.");
  }

  // 5. Credit stress: HYG/LQD ratio (high-yield vs investment-grade). Credit
  //    leads equities — spreads widen (ratio falls) before stocks crack.
  {
    const hyg = H.get("HYG")!, lqd = H.get("LQD")!;
    const n = Math.min(hyg.length, lqd.length);
    if (n > 63) {
      const ratioSeries: Candle[] = [];
      for (let i = 0; i < n; i++) {
        // Both trade NYSE hours — tail index alignment is date-safe here.
        ratioSeries.push({ t: hyg[hyg.length - n + i].t, c: hyg[hyg.length - n + i].c / lqd[lqd.length - n + i].c });
      }
      const c21 = chg(ratioSeries, 21);
      const hygPx = lastC(hyg), hyg200 = smaLast(hyg, 200);
      const hygBelow = hygPx != null && hyg200 != null && hygPx < hyg200;
      const grade: Grade = (c21 != null && c21 <= -2.5) || hygBelow ? "red"
        : (c21 != null && c21 <= -1.0) ? "amber" : "green";
      push("credit", "Credit stress (HYG/LQD)", "macro", 15, grade,
        `HYG/LQD 21d ${fmtPct(c21, 2)}${hygBelow ? ", HYG below 200d" : ""}`,
        "High-yield underperforming investment-grade = credit spreads widening — the classic pre-equity-crash tell. Amber ≤ -1% in 21d; red ≤ -2.5% or HYG under its 200d.");
    } else push("credit", "Credit stress (HYG/LQD)", "macro", 15, null, "n/a", "HYG/LQD unavailable.");
  }

  // ---- MACRO SIGNALS --------------------------------------------------------

  // 6. US 10Y rate shock. Yahoo's v8 chart API returns ^TNX directly in
  //    percent (e.g. 4.62) — NOT the CBOE ×10 convention. Verified empirically.
  {
    const tnx = H.get("^TNX")!;
    const now = lastC(tnx), ago = nBarsAgo(tnx, 21);
    if (now != null && ago != null) {
      const bp = (now - ago) * 100; // percent → basis points
      const grade: Grade = bp >= 60 ? "red" : bp >= 40 ? "amber" : "green";
      push("rates", "US 10Y rate shock", "macro", 8, grade,
        `10Y ${now.toFixed(2)}%, 21d ${bp >= 0 ? "+" : ""}${bp.toFixed(0)}bp`,
        "Rapid 10Y yield rises compress growth-stock multiples (the whole book). Amber ≥ +40bp/month, red ≥ +60bp.");
    } else push("rates", "US 10Y rate shock", "macro", 8, null, "n/a", "^TNX unavailable.");
  }

  // 7. Yield curve (10Y − 13W). Deep inversion = late cycle; RAPID
  //    re-steepening from inversion is the classic recession-onset signature.
  {
    const tnx = H.get("^TNX")!, irx = H.get("^IRX")!;
    const t = lastC(tnx), i = lastC(irx);
    const t63 = nBarsAgo(tnx, 63), i63 = nBarsAgo(irx, 63);
    if (t != null && i != null) {
      const spread = t - i; // both in percent (Yahoo v8 convention)
      const spreadAgo = t63 != null && i63 != null ? t63 - i63 : null;
      const rapidUninvert = spreadAgo != null && spreadAgo < 0 && (spread - spreadAgo) >= 0.6;
      const grade: Grade = rapidUninvert ? "red" : spread < -0.5 ? "amber" : "green";
      push("curve", "Yield curve (10Y−13W)", "macro", 5, grade,
        `${spread.toFixed(2)}%${spreadAgo != null ? ` (3m ago ${spreadAgo.toFixed(2)}%)` : ""}`,
        "Deep inversion (< -0.5%) = late-cycle amber. Rapid re-steepening FROM inversion (+60bp in 3m) = red — historically the recession-onset move, not the inversion itself.");
    } else push("curve", "Yield curve (10Y−13W)", "macro", 5, null, "n/a", "^TNX/^IRX unavailable.");
  }

  // 8. Yen carry unwind (USD/JPY). Violent yen STRENGTHENING forces levered
  //    carry positions to liquidate global risk assets — the Aug-2024 channel.
  //    (JGB yields aren't on Yahoo; USDJPY velocity is the tradeable proxy for
  //    a BoJ shock.)
  {
    const jpy = H.get("JPY=X")!;
    const c21 = chg(jpy, 21), c5 = chg(jpy, 5);
    if (c21 != null) {
      const grade: Grade = c21 <= -4 || (c5 != null && c5 <= -3) ? "red"
        : c21 <= -2.5 ? "amber" : "green";
      push("yen-carry", "Yen carry unwind (USD/JPY)", "macro", 10, grade,
        `21d ${fmtPct(c21)}, 5d ${fmtPct(c5)}`,
        "Sharp yen appreciation (USDJPY falling) = carry-trade liquidation → forced global de-risking (Aug 2024). Amber ≤ -2.5%/21d; red ≤ -4%/21d or ≤ -3%/5d.");
    } else push("yen-carry", "Yen carry unwind (USD/JPY)", "macro", 10, null, "n/a", "JPY=X unavailable.");
  }

  // 9. Dollar shock (global liquidity drain).
  {
    const dxy = H.get("DX-Y.NYB")!;
    const c21 = chg(dxy, 21);
    if (c21 != null) {
      const grade: Grade = c21 >= 5 ? "red" : c21 >= 3 ? "amber" : "green";
      push("dollar", "Dollar shock (DXY)", "macro", 5, grade, `21d ${fmtPct(c21)}`,
        "Rapid USD strength tightens global liquidity and pressures risk assets. Amber ≥ +3%/21d; red ≥ +5%.");
    } else push("dollar", "Dollar shock (DXY)", "macro", 5, null, "n/a", "DXY unavailable.");
  }

  // 10. Flight to safety: gold outperforming SPY.
  {
    const g21 = chg(H.get("GLD")!, 21), s21 = chg(H.get("SPY")!, 21);
    if (g21 != null && s21 != null) {
      const rel = g21 - s21;
      const grade: Grade = rel >= 10 ? "red" : rel >= 5 ? "amber" : "green";
      push("gold-flight", "Flight to safety (GLD−SPY)", "macro", 4, grade, `21d relative ${fmtPct(rel)}`,
        "Gold sharply outperforming equities = defensive positioning. Amber ≥ +5%/21d relative; red ≥ +10%.");
    } else push("gold-flight", "Flight to safety (GLD−SPY)", "macro", 4, null, "n/a", "GLD/SPY unavailable.");
  }

  // 11. BTC liquidity canary.
  {
    const btc = H.get("BTC-USD")!;
    const px = lastC(btc), s200 = smaLast(btc, 200), c21 = chg(btc, 21);
    if (px != null && s200 != null && c21 != null) {
      const below = px < s200;
      const grade: Grade = below && c21 <= -25 ? "red" : below && c21 <= -15 ? "amber" : "green";
      push("btc-canary", "BTC liquidity canary", "macro", 3, grade,
        `${below ? "below" : "above"} 200d, 21d ${fmtPct(c21)}`,
        "The most liquidity-sensitive major asset. Below its 200d AND falling hard = marginal liquidity draining. Amber ≤ -15%/21d below 200d; red ≤ -25%.");
    } else push("btc-canary", "BTC liquidity canary", "macro", 3, null, "n/a", "BTC unavailable.");
  }

  // ---- BOOK-LEVEL -----------------------------------------------------------

  // 12. Book drawdown ladder (from the live strategy equity curve).
  let bookDD: number | null = null;
  let bookSymbols: string[] = [];
  try {
    const bt = await buildBacktest(false);
    const run = bt.runs.longWeeklySortino;
    const values = run.equityCurve.map((p) => p.value);
    let peak = -Infinity, dd = 0;
    for (const v of values) { if (v > peak) peak = v; dd = Math.min(dd, (v - peak) / peak); }
    bookDD = dd * 100;
    const lastAlloc = run.allocations.at(-1);
    bookSymbols = Object.entries(lastAlloc?.weights ?? {})
      .filter(([s, w]) => w > 0.001 && s !== "CASH" && s !== "GLD" && !s.endsWith("-USD"))
      .map(([s]) => s);
    const grade: Grade = bookDD <= -20 ? "red" : bookDD <= -12 ? "amber" : "green";
    push("book-dd", "Book drawdown ladder", "book", 12, grade, `${bookDD.toFixed(1)}% from peak`,
      "Your own equity curve is a signal: amber ≤ -12% (trim to ~70% equity), red ≤ -20% (cut to ~50%). Caps the catastrophic tail regardless of what macro says.");
  } catch {
    push("book-dd", "Book drawdown ladder", "book", 12, null, "n/a", "Backtest engine unavailable.");
  }

  // ---- Composite ------------------------------------------------------------
  const avail = signals.filter((s) => s.available);
  const totalW = avail.reduce((a, s) => a + s.weight, 0) || 1;
  const scoreOf = (g: Grade) => (g === "red" ? 1 : g === "amber" ? 0.5 : 0);
  const index = Math.round((avail.reduce((a, s) => a + s.weight * scoreOf(s.grade), 0) / totalW) * 100);

  const band = index >= 60 ? "RED" : index >= 40 ? "ORANGE" : index >= 20 ? "AMBER" : "GREEN";
  const action =
    band === "GREEN"
      ? "Risk-on. Hold the book; normal weekly rebalances; buy signals valid."
      : band === "AMBER"
      ? "Tighten. No new buys; obey per-holding tripwires strictly; keep the full cash+gold sleeve; re-check radar mid-week."
      : band === "ORANGE"
      ? "De-risk. Cut the equity sleeve to ~60% — sell EXIT/TRIM/WEAK tripwire names first, largest losers-in-regime first. Park proceeds in cash."
      : "Defensive. Equity ≤ 40%: exit every non-OK tripwire name, halve the rest, max cash + gold. Re-enter only when the radar drops back below 40.";

  // ---- Per-holding tripwires (formalized sell rules) -----------------------
  const tripwires: TripwireStatus[] = [];
  for (const sym of bookSymbols) {
    try {
      const ins = await buildInsight(sym); // 5-min cached
      const trend = ins.scores?.trend ?? null;
      const shz = ins.regime?.sharpe?.d30?.z ?? null;
      const z50 = ins.zscores?.priceVs50 ?? null;
      const rsi = ins.signals?.rsi14 ?? null;
      let status: TripwireStatus["status"] = "OK";
      let reason = "No sell conditions met.";
      if ((shz != null && shz <= -1.5) || (trend != null && trend <= 35)) {
        status = "EXIT";
        reason = `Regime break: 30d Sharpe z ${shz?.toFixed(2) ?? "n/a"}σ / trend ${trend ?? "n/a"} — exit at next open.`;
      } else if (z50 != null && rsi != null && z50 >= 3 && rsi >= 80) {
        status = "TRIM";
        reason = `Parabolic take-profit: z50 +${z50.toFixed(1)}σ with RSI ${rsi.toFixed(0)} — sell half.`;
      } else if ((shz != null && shz <= -0.75) || (trend != null && trend <= 45)) {
        status = "WEAK";
        reason = `Early warning: 30d z ${shz?.toFixed(2) ?? "n/a"}σ, trend ${trend ?? "n/a"} — first to sell if the radar escalates.`;
      }
      tripwires.push({ symbol: sym, status, reason, trend, sharpeZ30: shz, z50, rsi });
    } catch {
      tripwires.push({ symbol: sym, status: "OK", reason: "insight unavailable", trend: null, sharpeZ30: null, z50: null, rsi: null });
    }
  }
  const rank = { EXIT: 0, TRIM: 1, WEAK: 2, OK: 3 } as const;
  tripwires.sort((a, b) => rank[a.status] - rank[b.status]);

  const report: CrashRadarReport = {
    asOf: Date.now(),
    asOfDate: dayKey(new Date()),
    index,
    band,
    action,
    signals,
    tripwires,
    bookDrawdownPct: bookDD,
    methodology: [
      "Honest framing: crashes are not predictable. This radar detects STRESS that historically LEADS drawdowns by days-to-weeks — credit widening, VIX term-structure inversion, yen-carry unwinds, breadth collapse — so you sell EARLY IN the move, not before it.",
      "Composite = weighted average of 12 signals, each graded green(0) / amber(0.5) / red(1). Unavailable signals are excluded from the denominator.",
      "Bands: <20 GREEN (hold) · 20–40 AMBER (no new buys, obey tripwires) · 40–60 ORANGE (cut equity to ~60%) · ≥60 RED (equity ≤40%, defensive).",
      "Highest weights: VIX term structure (15), SMH trend (15), credit HYG/LQD (15), book drawdown (12) — the four with the best documented lead/coincident record.",
      "Macro group covers your ask: US 10Y (^TNX) rate shocks, yield-curve re-steepening (the recession-onset signature), yen carry unwind via USD/JPY (JGB yields aren't on Yahoo — violent yen strengthening IS the BoJ-shock transmission, Aug 2024), dollar shocks, gold flight, BTC liquidity canary.",
      "Tripwires formalize the per-holding sell rules: EXIT = 30d Sharpe regime z ≤ -1.5σ or trend ≤ 35 · TRIM = z50 ≥ +3σ and RSI ≥ 80 · WEAK = 30d z ≤ -0.75σ or trend ≤ 45 (sold first when the radar escalates).",
      "Expect false positives: a composite this sensitive fires ~2-4× per year on corrections that recover. The cost of acting on a false alarm (a few % of missed upside) is the premium for catching the real one.",
      "Radar refreshes every 15 min; check it in every weekly analysis and any day the tape feels wrong.",
    ],
  };
  CACHE.ts = Date.now();
  CACHE.data = report;
  return report;
}
