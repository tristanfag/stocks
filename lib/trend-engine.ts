import { getHistory, getQuotes } from "./yahoo";
import { TREND_GRAPH, type TrendNode } from "./trends";
import { mean, returns, sma, pctChange, zScore, score } from "./stats";

export type HeatComponents = {
  rs: number;          // blended RS vs SPY (raw % delta)
  rsScore: number;     // 0..100
  breadth: number;     // 0..100 (% above the relevant SMA)
  momZScore: number;   // 0..100
  rawZ: number | null; // raw rolling-return z-score
};

export type ThemeHeat = {
  id: string;
  title: string;
  blurb: string;
  logic: string;
  group: string;
  parent?: string;
  feeds: string[];
  symbols: string[];
  /** Blended of 1m + 3m relative strength, breadth above SMA50, 21d-rolling-return z. */
  heatMid: number;
  componentsMid: HeatComponents;
  /** Blended of 6m + 12m relative strength, breadth above SMA200, 63d-rolling-return z. */
  heatLong: number;
  componentsLong: HeatComponents;
  windowReturns: {
    ret1d: number | null;     // basket-avg today's % change
    ret1m: number | null;
    ret3m: number | null;
    ret6m: number | null;
    ret12m: number | null;
  };
  topMover: { symbol: string; changePct: number | null } | null;
};

export type TrendReport = {
  asOf: number;
  spyReturns: { ret1d: number | null; ret1m: number | null; ret3m: number | null; ret6m: number | null; ret12m: number | null };
  themes: ThemeHeat[];
  reigningMid: ThemeHeat | null;
  reigningLong: ThemeHeat | null;
  beneficiariesMid: ThemeHeat[];
  beneficiariesLong: ThemeHeat[];
};

const CACHE: { ts: number; data: TrendReport | null } = { ts: 0, data: null };
const TTL_MS = 5 * 60 * 1000;

export async function buildTrendReport(): Promise<TrendReport> {
  if (CACHE.data && Date.now() - CACHE.ts < TTL_MS) return CACHE.data;

  // SPY benchmark
  const spy = await getHistory("SPY", "1y");
  const spyClose = spy.map((c) => c.c);
  const spyRet = (n: number) => spyClose.length > n
    ? pctChange(spyClose[spyClose.length - 1 - n], spyClose[spyClose.length - 1])
    : null;
  const spy1d  = spyRet(1);
  const spy1m  = spyRet(21);
  const spy3m  = spyRet(63);
  const spy6m  = spyRet(126);
  const spy12m = spyRet(252);

  const nodeIds = Object.keys(TREND_GRAPH);
  const themes: ThemeHeat[] = [];

  for (const id of nodeIds) {
    const node = TREND_GRAPH[id];
    const t = await scoreTheme(node, { spy1m, spy3m, spy6m, spy12m });
    themes.push(t);
  }

  // Two separate rankings
  const themesByMid  = [...themes].sort((a, b) => b.heatMid  - a.heatMid);
  const themesByLong = [...themes].sort((a, b) => b.heatLong - a.heatLong);
  const reigningMid  = themesByMid[0]  ?? null;
  const reigningLong = themesByLong[0] ?? null;

  const beneficiariesMid  = reigningMid  ? collectBeneficiaries(reigningMid.id,  themes, "mid")  : [];
  const beneficiariesLong = reigningLong ? collectBeneficiaries(reigningLong.id, themes, "long") : [];

  // Default `themes` order = medium-term ranking (most actionable / recent)
  const report: TrendReport = {
    asOf: Date.now(),
    spyReturns: { ret1d: spy1d, ret1m: spy1m, ret3m: spy3m, ret6m: spy6m, ret12m: spy12m },
    themes: themesByMid,
    reigningMid,
    reigningLong,
    beneficiariesMid,
    beneficiariesLong,
  };
  CACHE.ts = Date.now();
  CACHE.data = report;
  return report;
}

function collectBeneficiaries(rootId: string, allThemes: ThemeHeat[], horizon: "mid" | "long"): ThemeHeat[] {
  const map = new Map(allThemes.map((t) => [t.id, t]));
  const seen = new Set<string>();
  const out: ThemeHeat[] = [];
  const walk = (id: string, depth: number) => {
    if (depth <= 0) return;
    const node = TREND_GRAPH[id];
    if (!node) return;
    for (const child of node.feeds) {
      if (seen.has(child)) continue;
      seen.add(child);
      const t = map.get(child);
      if (t) out.push(t);
      walk(child, depth - 1);
    }
  };
  walk(rootId, 2);
  out.sort((a, b) =>
    horizon === "mid" ? b.heatMid - a.heatMid : b.heatLong - a.heatLong,
  );
  return out;
}

async function scoreTheme(node: TrendNode, spyR: {
  spy1m: number | null; spy3m: number | null; spy6m: number | null; spy12m: number | null;
}): Promise<ThemeHeat> {
  const histories = await Promise.all(node.symbols.map((s) => getHistory(s, "1y")));
  const quotes = await getQuotes(node.symbols);

  // Per-symbol windowed returns + breadth ingredients
  const ret1mList: number[] = [];
  const ret3mList: number[] = [];
  const ret6mList: number[] = [];
  const ret12mList: number[] = [];
  let aboveSma50 = 0, aboveSma200 = 0, eligible50 = 0, eligible200 = 0;

  for (let i = 0; i < node.symbols.length; i++) {
    const closes = histories[i].map((c) => c.c);
    if (closes.length < 30) continue;
    const last = closes[closes.length - 1];
    const at = (n: number) => closes.length > n ? closes[closes.length - 1 - n] : null;
    const r1  = at(21)  ? pctChange(at(21)!,  last) : null;
    const r3  = at(63)  ? pctChange(at(63)!,  last) : null;
    const r6  = at(126) ? pctChange(at(126)!, last) : null;
    const r12 = at(252) ? pctChange(at(252)!, last) : null;
    if (r1  != null) ret1mList.push(r1);
    if (r3  != null) ret3mList.push(r3);
    if (r6  != null) ret6mList.push(r6);
    if (r12 != null) ret12mList.push(r12);

    const sma50last  = sma(closes, 50).at(-1);
    const sma200last = sma(closes, 200).at(-1);
    if (sma50last != null) {
      eligible50++;
      if (last > sma50last) aboveSma50++;
    }
    if (sma200last != null) {
      eligible200++;
      if (last > sma200last) aboveSma200++;
    }
  }

  const basket1m  = ret1mList.length  ? mean(ret1mList)  : null;
  const basket3m  = ret3mList.length  ? mean(ret3mList)  : null;
  const basket6m  = ret6mList.length  ? mean(ret6mList)  : null;
  const basket12m = ret12mList.length ? mean(ret12mList) : null;
  // Basket 1d return: equal-weighted average of today's % change across constituents.
  const todayPcts = quotes.map((q) => q.changePct).filter((x): x is number => x != null);
  const basket1d  = todayPcts.length ? mean(todayPcts) : null;

  // ---- Medium-term: 1m + 3m RS, breadth(SMA50), 21d momentum z --------------
  const rsMid = blendRS([
    [basket1m, spyR.spy1m, 0.6],
    [basket3m, spyR.spy3m, 0.4],
  ]);
  const breadthMid = eligible50 ? (aboveSma50 / eligible50) * 100 : 50;
  const momZMid = bucketMomZ(histories, 21);
  const componentsMid: HeatComponents = {
    rs: rsMid,
    rsScore: Math.round(score(rsMid, -10, 15)),
    breadth: Math.round(breadthMid),
    momZScore: momZMid.rawZ != null ? Math.round(score(momZMid.rawZ, -2, 2)) : 50,
    rawZ: momZMid.rawZ,
  };
  const heatMid = Math.round(
    componentsMid.rsScore * 0.50 +
    componentsMid.breadth * 0.25 +
    componentsMid.momZScore * 0.25,
  );

  // ---- Long-term: 6m + 12m RS, breadth(SMA200), 63d momentum z --------------
  const rsLong = blendRS([
    [basket6m,  spyR.spy6m,  0.5],
    [basket12m, spyR.spy12m, 0.5],
  ]);
  const breadthLong = eligible200 ? (aboveSma200 / eligible200) * 100 : 50;
  const momZLong = bucketMomZ(histories, 63);
  const componentsLong: HeatComponents = {
    rs: rsLong,
    rsScore: Math.round(score(rsLong, -20, 30)),
    breadth: Math.round(breadthLong),
    momZScore: momZLong.rawZ != null ? Math.round(score(momZLong.rawZ, -2, 2)) : 50,
    rawZ: momZLong.rawZ,
  };
  const heatLong = Math.round(
    componentsLong.rsScore * 0.50 +
    componentsLong.breadth * 0.25 +
    componentsLong.momZScore * 0.25,
  );

  // Top mover (current % change)
  const movers = quotes
    .map((q) => ({ symbol: q.symbol, changePct: q.changePct }))
    .filter((q) => q.changePct != null)
    .sort((a, b) => (b.changePct ?? -Infinity) - (a.changePct ?? -Infinity));
  const topMover = movers[0] ?? null;

  return {
    id: node.id,
    title: node.title,
    blurb: node.blurb,
    logic: node.logic,
    group: node.group,
    parent: node.parent,
    feeds: node.feeds,
    symbols: node.symbols,
    heatMid,
    componentsMid,
    heatLong,
    componentsLong,
    windowReturns: { ret1d: basket1d, ret1m: basket1m, ret3m: basket3m, ret6m: basket6m, ret12m: basket12m },
    topMover,
  };
}

/** Weighted blend of (basketRet, spyRet, weight) tuples. Returns weighted avg of (basket - spy). */
function blendRS(parts: Array<[number | null, number | null, number]>): number {
  const usable = parts.filter(([b, s]) => b != null && s != null) as Array<[number, number, number]>;
  if (!usable.length) return 0;
  const totalW = usable.reduce((a, [, , w]) => a + w, 0);
  return usable.reduce((a, [b, s, w]) => a + (b - s) * w, 0) / totalW;
}

/** Compute equal-weighted basket daily returns and z-score the latest cumulative `window`-day return. */
function bucketMomZ(histories: { c: number }[][], window: number): { rawZ: number | null } {
  try {
    const series = histories.map((h) => h.map((c) => c.c)).filter((s) => s.length >= 50);
    if (!series.length) return { rawZ: null };
    const minLen = Math.min(...series.map((s) => s.length));
    const trimmed = series.map((s) => s.slice(-minLen));
    const basketDaily: number[] = [];
    for (let i = 1; i < minLen; i++) {
      let sum = 0, n = 0;
      for (const ser of trimmed) {
        const r = (ser[i] - ser[i - 1]) / ser[i - 1];
        if (Number.isFinite(r)) { sum += r; n++; }
      }
      if (n) basketDaily.push(sum / n);
    }
    const rolling: number[] = [];
    for (let i = window; i < basketDaily.length; i++) {
      let cum = 0;
      for (let j = i - window; j < i; j++) cum += basketDaily[j];
      rolling.push(cum);
    }
    if (rolling.length < 5) return { rawZ: null };
    const last = rolling[rolling.length - 1];
    const z = zScore(last, rolling);
    return { rawZ: z };
  } catch {
    return { rawZ: null };
  }
}
