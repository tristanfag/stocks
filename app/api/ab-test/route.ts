import { NextResponse } from "next/server";
import { STRATEGY, runOneOff, type Horizon } from "@/lib/backtest";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

/**
 * Dev-only A/B harness: runs the same horizon under different STRATEGY
 * parameter sets so enhancements can be proven before being enabled.
 * Mutates the shared STRATEGY object, so it runs variants sequentially and
 * always restores the original values.
 */
type Variant = { name: string; patch: Partial<typeof STRATEGY> };

const VARIANTS: Variant[] = [
  { name: "baseline (no enhancements)", patch: { rankBuffer: 0, corrPenalty: 0, radarScaledExposure: false } },
  { name: "+ hysteresis only",          patch: { rankBuffer: 4, corrPenalty: 0, radarScaledExposure: false } },
  { name: "+ correlation only",         patch: { rankBuffer: 0, corrPenalty: 25, radarScaledExposure: false } },
  { name: "+ radar exposure only",      patch: { rankBuffer: 0, corrPenalty: 0, radarScaledExposure: true } },
  { name: "ALL enhancements",           patch: { rankBuffer: 4, corrPenalty: 25, radarScaledExposure: true } },
];

/** Concentration sweep: how many equity holdings is optimal? */
const TOPN_VARIANTS: Variant[] = [
  { name: "topN = 3 (very concentrated)", patch: { equityTopN: 3, weightCap: 0.40 } },
  { name: "topN = 4",                     patch: { equityTopN: 4, weightCap: 0.35 } },
  { name: "topN = 5 (requested)",         patch: { equityTopN: 5, weightCap: 0.30 } },
  { name: "topN = 6",                     patch: { equityTopN: 6, weightCap: 0.28 } },
  { name: "topN = 8 (current)",           patch: { equityTopN: 8, weightCap: 0.25 } },
  { name: "topN = 10 (diversified)",      patch: { equityTopN: 10, weightCap: 0.20 } },
];

export async function GET(req: Request) {
  const url = new URL(req.url);
  const horizon = (url.searchParams.get("horizon") ?? "longWeeklySortino") as Horizon;
  const ranker = (url.searchParams.get("ranker") ?? "sortino") as typeof STRATEGY.ranker;
  // Default to the full 2024-2026 history so the sample is long enough to mean
  // something (~120 weekly rebalances vs ~11 since live inception).
  const startDate = url.searchParams.get("start") ?? "2024-01-01";
  const startCapital = Number(url.searchParams.get("capital") ?? "20000");
  const mode = url.searchParams.get("mode") ?? "enhancements";
  const HORIZON_VARIANTS: Variant[] = [
    { name: "Short (1m sig, weekly)", patch: {} },
    { name: "Medium (3m sig, monthly)", patch: {} },
    { name: "Long (12m sig, monthly)", patch: {} },
    { name: "Long weekly (12m, weekly)", patch: {} },
    { name: "Long Sortino weekly", patch: {} },
  ];
  const HORIZON_KEYS: Array<[Horizon, typeof STRATEGY.ranker]> = [
    ["short", "blended"], ["medium", "blended"], ["long", "blended"],
    ["longWeekly", "blended"], ["longWeeklySortino", "sortino"],
  ];
  const variantSet = mode === "topn" ? TOPN_VARIANTS : mode === "horizons" ? HORIZON_VARIANTS : VARIANTS;

  const original = { ...STRATEGY };
  const results: any[] = [];
  try {
    for (let vi = 0; vi < variantSet.length; vi++) {
      const v = variantSet[vi];
      Object.assign(STRATEGY, original, { startDate, startCapital }, v.patch);
      const [hz, rk] = mode === "horizons" ? HORIZON_KEYS[vi] : [horizon, ranker];
      const universe = (url.searchParams.get("universe") ?? "themes") as "themes" | "etf";
      const run = await runOneOff({ horizon: hz, ranker: rk, universe });
      // one-way turnover across the rebalance path
      let turn = 0;
      for (let i = 1; i < run.allocations.length; i++) {
        const a = run.allocations[i - 1].weights, b = run.allocations[i].weights;
        const syms = new Set([...Object.keys(a), ...Object.keys(b)]);
        let t = 0;
        for (const s of syms) t += Math.abs((b[s] ?? 0) - (a[s] ?? 0));
        turn += t / 2;
      }
      const rebals = Math.max(1, run.allocations.length - 1);
      // Net-of-friction view: the raw backtest models ZERO trading costs, which
      // structurally flatters high-turnover variants. Apply a per-unit-turnover
      // cost (spread + slippage) compounded across the path.
      const years = (new Date(run.summary.endDate).getTime() - new Date(run.summary.startDate).getTime()) / (365.25 * 864e5);
      const netOf = (bpsPerTurn: number) => {
        const drag = turn * (bpsPerTurn / 10000); // total fractional cost
        const gross = run.summary.endValue / STRATEGY.startCapital;
        const net = gross * (1 - drag);
        return {
          endValue: Number((net * STRATEGY.startCapital).toFixed(0)),
          cagrPct: Number(((Math.pow(Math.max(net, 1e-9), 1 / Math.max(years, 1e-9)) - 1) * 100).toFixed(1)),
        };
      };
      // Optional: yearly equity-curve samples + worst calendar-year drawdowns,
      // so extraordinary summary numbers can be sanity-checked against crisis periods.
      let curve: any = undefined, byYear: any = undefined;
      if (url.searchParams.get("curve") === "1") {
        const pts = run.equityCurve;
        const seen = new Set<string>();
        curve = [];
        for (const pt of pts) {
          const ym = pt.date.slice(0, 7);
          const q = ym.slice(0, 4) + "-Q" + (Math.floor(Number(ym.slice(5, 7) as any) / 3.01) + 1);
          if (!seen.has(q)) {
            seen.add(q);
            const al = run.allocations.find((a) => a.date === pt.date);
            const holds = al ? Object.entries(al.weights).filter(([, w]) => w > 0.001)
              .sort((a, b) => b[1] - a[1]).map(([sy, w]) => sy + ":" + (w * 100).toFixed(0)).join(" ") : "";
            curve.push({ q, date: pt.date, value: Math.round(pt.value), spy: Math.round(pt.spyValue), holds });
          }
        }
        // peak-to-trough within each calendar year
        const yrs: Record<string, { peak: number; dd: number; start: number; end: number }> = {};
        for (const pt of pts) {
          const y = pt.date.slice(0, 4);
          if (!yrs[y]) yrs[y] = { peak: pt.value, dd: 0, start: pt.value, end: pt.value };
          const o = yrs[y];
          if (pt.value > o.peak) o.peak = pt.value;
          o.dd = Math.min(o.dd, (pt.value - o.peak) / o.peak);
          o.end = pt.value;
        }
        byYear = Object.entries(yrs).map(([y, o]) => ({
          year: y,
          ret: Number(((o.end / o.start - 1) * 100).toFixed(1)),
          worstDD: Number((o.dd * 100).toFixed(1)),
        }));
      }
      results.push({
        variant: v.name,
        curve, byYear,
        endValue: Number(run.summary.endValue.toFixed(2)),
        totalReturnPct: Number(run.summary.totalReturnPct.toFixed(2)),
        net10bps: netOf(10),
        net25bps: netOf(25),
        net50bps: netOf(50),
        maxDrawdownPct: Number(run.summary.maxDrawdownPct.toFixed(2)),
        sharpe: Number(run.summary.sharpe.toFixed(2)),
        volAnnPct: Number(run.summary.volAnn.toFixed(1)),
        turnoverTotalPct: Number((turn * 100).toFixed(0)),
        turnoverAnnualizedPct: Number((turn / rebals * 52 * 100).toFixed(0)),
        rebalances: rebals,
      });
    }
  } catch (e: any) {
    Object.assign(STRATEGY, original);
    return NextResponse.json({ error: String(e?.message ?? e), partial: results }, { status: 500 });
  }
  Object.assign(STRATEGY, original);
  return NextResponse.json({ horizon, ranker, startDate: STRATEGY.startDate, results });
}
