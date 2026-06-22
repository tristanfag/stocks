import { NextResponse } from "next/server";
import { runOneOff, type Horizon } from "@/lib/backtest";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 120;

const ALLOWED_HORIZONS: Horizon[] = ["short", "medium", "long", "longWeekly", "mediumWeekly", "shortMonthly", "longWeeklySortino"];
const ALLOWED_RANKERS = ["sharpe", "sortino", "omega", "blended"] as const;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const horizon = url.searchParams.get("horizon") as Horizon | null;
  const ranker = url.searchParams.get("ranker");
  if (!horizon || !ALLOWED_HORIZONS.includes(horizon)) {
    return NextResponse.json({ error: "missing/invalid horizon" }, { status: 400 });
  }
  if (ranker && !ALLOWED_RANKERS.includes(ranker as any)) {
    return NextResponse.json({ error: "invalid ranker" }, { status: 400 });
  }
  try {
    const run = await runOneOff({ horizon, ranker: ranker as any });
    return NextResponse.json({
      horizon: run.horizon,
      config: run.config,
      summary: run.summary,
      rebalances: run.equityCurve.length - 1,
      ranker: ranker ?? "blended (default)",
    });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
