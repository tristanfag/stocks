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

export async function GET(req: Request) {
  const url = new URL(req.url);
  const horizon = (url.searchParams.get("horizon") ?? "longWeeklySortino") as Horizon;
  const ranker = (url.searchParams.get("ranker") ?? "sortino") as typeof STRATEGY.ranker;
  // Default to the full 2024-2026 history so the sample is long enough to mean
  // something (~120 weekly rebalances vs ~11 since live inception).
  const startDate = url.searchParams.get("start") ?? "2024-01-01";
  const startCapital = Number(url.searchParams.get("capital") ?? "20000");

  const original = { ...STRATEGY };
  const results: any[] = [];
  try {
    for (const v of VARIANTS) {
      Object.assign(STRATEGY, original, { startDate, startCapital }, v.patch);
      const run = await runOneOff({ horizon, ranker });
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
      results.push({
        variant: v.name,
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
