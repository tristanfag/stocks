import { buildInsight, type Insight } from "./insight";
import { buildTrendReport } from "./trend-engine";
import { TREND_GRAPH } from "./trends";
import { getQuotes } from "./yahoo";
import { promises as fs } from "node:fs";
import path from "node:path";

export type Verdict = "BUY" | "HOLD" | "SELL";
export type Conviction = "low" | "medium" | "high";

export type AnalystNote = {
  headline: string;
  narrative: string;
  /** verdict the human/Claude analyst tagged for this ticker — may differ from rule verdict */
  verdict?: Verdict;
};

export type Recommendation = {
  symbol: string;
  themes: string[];                           // theme IDs this ticker belongs to
  inReigningMid: boolean;                     // member of medium-term reigning theme?
  inReigningLong: boolean;                    // member of long-term reigning theme?
  verdict: Verdict;
  conviction: Conviction;
  reasons: string[];                          // why this verdict
  warnings: string[];                         // counter-indicators
  analystNote?: AnalystNote;                  // hand-written narrative from saved snapshot
  // headline numbers for display
  price: number | null;
  changePct: number | null;
  edge: number | null;
  trendScore: number | null;
  momentumScore: number | null;
  ret1m: number | null;
  ret3m: number | null;
  rsi14: number | null;
  z50: number | null;
  sharpeZ30: number | null;
  sharpeZ365: number | null;
  analystUpsidePct: number | null;
};

export type AnalystSnapshot = {
  dayKey: string;
  asOfLocal: string;
  author: string;
  summary: string;
  tickers: Record<string, AnalystNote>;
};

export type RecommendationsReport = {
  asOfMs: number;
  asOfIso: string;            // ISO date
  asOfLocal: string;          // human-readable timestamp
  dayKey: string;             // YYYY-MM-DD
  methodology: string[];
  counts: { buy: number; hold: number; sell: number };
  recommendations: Recommendation[];
  /** Hand-written analyst snapshot for the most recent saved file (if available) */
  analyst: {
    available: boolean;
    dayKey?: string;
    asOfLocal?: string;
    author?: string;
    summary?: string;
    coverage: number;        // count of tickers with a note
  };
};

// Daily snapshot cache (in-memory): keyed by YYYY-MM-DD UTC.
const SNAPSHOT_CACHE = new Map<string, RecommendationsReport>();

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Load the most recent analyst-written snapshot under data/analysis/YYYY-MM-DD.json.
 * Walks back up to 14 days from `today` looking for the freshest available file.
 */
async function loadAnalystSnapshot(today: string): Promise<AnalystSnapshot | null> {
  const dir = path.join(process.cwd(), "data", "analysis");
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return null;
  }
  const candidates = entries
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map((f) => f.replace(".json", ""))
    .filter((d) => d <= today)
    .sort()
    .reverse();
  for (const day of candidates) {
    try {
      const raw = await fs.readFile(path.join(dir, `${day}.json`), "utf8");
      const j = JSON.parse(raw) as AnalystSnapshot;
      if (j && j.tickers) return j;
    } catch {
      continue;
    }
  }
  return null;
}

export async function buildRecommendations(force = false): Promise<RecommendationsReport> {
  const now = new Date();
  const key = dayKey(now);
  if (!force) {
    const hit = SNAPSHOT_CACHE.get(key);
    if (hit) return hit;
  }

  // Collect symbols from trend graph (deduped) + theme membership map.
  const symbolThemes = new Map<string, string[]>();
  for (const node of Object.values(TREND_GRAPH)) {
    for (const sym of node.symbols) {
      const arr = symbolThemes.get(sym) ?? [];
      if (!arr.includes(node.id)) arr.push(node.id);
      symbolThemes.set(sym, arr);
    }
  }
  const symbols = Array.from(symbolThemes.keys());

  // Trend report tells us reigning themes (mid + long) — needed for theme tailwind reason.
  const trend = await buildTrendReport();
  const reigningMidSyms  = new Set<string>(trend.reigningMid?.symbols  ?? []);
  const reigningLongSyms = new Set<string>(trend.reigningLong?.symbols ?? []);

  // Build insight for each symbol — heavy first time, cheap once cached (5 min TTL in insight.ts).
  // Run with bounded concurrency to avoid stampeding Yahoo.
  const insights: Array<{ sym: string; insight: Insight | null }> = [];
  const CONCURRENCY = 8;
  for (let i = 0; i < symbols.length; i += CONCURRENCY) {
    const batch = symbols.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(async (sym) => {
      try {
        const insight = await buildInsight(sym);
        return { sym, insight };
      } catch {
        return { sym, insight: null };
      }
    }));
    insights.push(...results);
  }

  // Load most-recent analyst-written snapshot (today or freshest in last 14 days).
  const snapshot = await loadAnalystSnapshot(key);

  // Fetch live quotes once so we can attach today's % change.
  const quotes = await getQuotes(symbols);
  const quoteMap = new Map(quotes.map((q) => [q.symbol, q]));

  // Apply rule-based classifier.
  const recs: Recommendation[] = [];
  for (const { sym, insight } of insights) {
    if (!insight) continue;
    const themes = symbolThemes.get(sym) ?? [];
    const inMid  = reigningMidSyms.has(sym);
    const inLong = reigningLongSyms.has(sym);
    const rec = classify(sym, insight, themes, inMid, inLong);
    const q = quoteMap.get(sym);
    if (q) rec.changePct = q.changePct;
    const note = snapshot?.tickers[sym];
    if (note) rec.analystNote = note;
    recs.push(rec);
  }

  recs.sort((a, b) => {
    const verdictRank = { BUY: 0, HOLD: 1, SELL: 2 } as const;
    const convRank    = { high: 0, medium: 1, low: 2 } as const;
    if (verdictRank[a.verdict] !== verdictRank[b.verdict])
      return verdictRank[a.verdict] - verdictRank[b.verdict];
    if (convRank[a.conviction] !== convRank[b.conviction])
      return convRank[a.conviction] - convRank[b.conviction];
    return (b.edge ?? 0) - (a.edge ?? 0);
  });

  const counts = { buy: 0, hold: 0, sell: 0 };
  for (const r of recs) {
    if (r.verdict === "BUY")  counts.buy++;
    else if (r.verdict === "SELL") counts.sell++;
    else counts.hold++;
  }

  const coverage = snapshot ? Object.keys(snapshot.tickers).length : 0;
  const report: RecommendationsReport = {
    asOfMs: now.getTime(),
    asOfIso: now.toISOString(),
    asOfLocal: now.toLocaleString("en-US", {
      weekday: "short", year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit", timeZoneName: "short",
    }),
    dayKey: key,
    methodology: METHODOLOGY,
    counts,
    recommendations: recs,
    analyst: snapshot
      ? {
          available: true,
          dayKey: snapshot.dayKey,
          asOfLocal: snapshot.asOfLocal,
          author: snapshot.author,
          summary: snapshot.summary,
          coverage,
        }
      : { available: false, coverage: 0 },
  };
  SNAPSHOT_CACHE.set(key, report);
  return report;
}

const METHODOLOGY = [
  "Verdict is rule-based, not a forecast. Each ticker is scored on six BUY signals and five SELL signals; the count drives verdict + conviction.",
  "BUY signals: Edge ≥ 65 · 30d Sharpe regime z ≥ +1.0 · Trend score ≥ 65 · Member of reigning theme (medium OR long) · Analyst upside ≥ 15% · Quality ≥ 70.",
  "SELL signals: RSI ≥ 75 within 3% of 52w high · 30d Sharpe z ≤ -1.5 · Trend score ≤ 35 · Trades above analyst target by ≥10% · Death cross (SMA50 < SMA200).",
  "Conviction = how many signals fire. ≥4 = high, 3 = medium, 2 = low. Tie or mixed = HOLD.",
  "All metrics are backward-looking. Past behaviour is not a guarantee of future returns. Use as a research signal, not a trade ticket.",
];

function classify(
  symbol: string,
  ins: Insight,
  themes: string[],
  inReigningMid: boolean,
  inReigningLong: boolean,
): Recommendation {
  const buy: string[] = [];
  const sell: string[] = [];

  const edge = ins.scores?.edge ?? null;
  const trendScore = ins.scores?.trend ?? null;
  const momentumScore = ins.scores?.momentum ?? null;
  const qualityScore = ins.scores?.quality ?? null;
  const rsi = ins.signals?.rsi14 ?? null;
  const distHigh = ins.zscores?.distFrom52wHighPct ?? null;
  const z50 = ins.zscores?.priceVs50 ?? null;
  const sharpeZ30  = ins.regime?.sharpe?.d30?.z  ?? null;
  const sharpeZ365 = ins.regime?.sharpe?.d365?.z ?? null;
  const analystUpside = ins.expected?.analystUpsidePct ?? null;
  const goldenCross = ins.signals?.goldenCross ?? null;
  const deathCross  = ins.signals?.deathCross ?? null;

  // ---- BUY signals -------------------------------------------------------
  if (edge != null && edge >= 65) buy.push(`Edge score ${edge} ≥ 65 (composite alpha factor strong).`);
  if (sharpeZ30 != null && sharpeZ30 >= 1.0)
    buy.push(`30d Sharpe is +${sharpeZ30.toFixed(1)}σ vs own 5y — entering favourable regime.`);
  if (trendScore != null && trendScore >= 65 && goldenCross === true)
    buy.push(`Trend score ${trendScore} + golden cross (SMA50>SMA200) — primary uptrend intact.`);
  if (inReigningMid || inReigningLong) {
    const tags = [inReigningMid && "medium-term", inReigningLong && "long-term"].filter(Boolean).join(" + ");
    buy.push(`In reigning theme on ${tags} horizon — sector tailwind.`);
  }
  if (analystUpside != null && analystUpside >= 15)
    buy.push(`Analyst consensus implies +${analystUpside.toFixed(0)}% upside.`);
  if (qualityScore != null && qualityScore >= 70)
    buy.push(`Quality score ${qualityScore} ≥ 70 (margins / ROE / balance sheet healthy).`);

  // ---- SELL signals ------------------------------------------------------
  if (rsi != null && rsi >= 75 && distHigh != null && distHigh > -3)
    sell.push(`RSI ${rsi.toFixed(0)} at 52w-high zone — exhaustion risk.`);
  if (sharpeZ30 != null && sharpeZ30 <= -1.5)
    sell.push(`30d Sharpe is ${sharpeZ30.toFixed(1)}σ — regime degrading vs own history.`);
  if (trendScore != null && trendScore <= 35)
    sell.push(`Trend score ${trendScore} ≤ 35 — below trend, momentum negative.`);
  if (analystUpside != null && analystUpside <= -10)
    sell.push(`Trades ${Math.abs(analystUpside).toFixed(0)}% above consensus target — priced for perfection.`);
  if (deathCross === true)
    sell.push("Death cross active (SMA50 < SMA200) — long-term trend broken.");

  // Hard veto: even with BUY signals, parabolic extension is a HOLD-at-best.
  let parabolicVeto = false;
  if ((rsi != null && rsi >= 80) || (z50 != null && z50 >= 2.5)) {
    parabolicVeto = true;
    sell.push(`Parabolic extension (RSI ${rsi?.toFixed(0) ?? "—"}, z50 ${z50?.toFixed(1) ?? "—"}σ) — wait for cooling.`);
  }

  // Verdict logic
  let verdict: Verdict = "HOLD";
  let conviction: Conviction = "low";
  if (sell.length >= 2 && sell.length > buy.length) {
    verdict = "SELL";
    conviction = sell.length >= 4 ? "high" : sell.length >= 3 ? "medium" : "low";
  } else if (buy.length >= 3 && !parabolicVeto && buy.length > sell.length) {
    verdict = "BUY";
    conviction = buy.length >= 5 ? "high" : buy.length >= 4 ? "medium" : "low";
  } else {
    verdict = "HOLD";
    conviction = (buy.length >= 2 || sell.length >= 1) ? "medium" : "low";
  }

  return {
    symbol,
    themes,
    inReigningMid,
    inReigningLong,
    verdict,
    conviction,
    reasons: verdict === "BUY" ? buy : verdict === "SELL" ? sell : [...buy, ...sell],
    warnings: verdict === "BUY" ? sell : verdict === "SELL" ? buy : [],
    price: ins.price,
    changePct: null, // wired in route layer if desired
    edge,
    trendScore,
    momentumScore,
    ret1m: ins.stats?.ret1m ?? null,
    ret3m: ins.stats?.ret3m ?? null,
    rsi14: rsi,
    z50,
    sharpeZ30,
    sharpeZ365,
    analystUpsidePct: analystUpside,
  };
}
