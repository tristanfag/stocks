import { NextResponse } from "next/server";
import { buildBacktest } from "@/lib/backtest";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 120;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";
  try {
    const report = await buildBacktest(force);
    return NextResponse.json(report);
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
