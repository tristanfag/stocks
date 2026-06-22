import { NextResponse } from "next/server";
import { computeTodayAllocations } from "@/lib/backtest";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const capital = Number(url.searchParams.get("capital") ?? "20000");
  const forceCryptoOn = url.searchParams.get("crypto") === "on";
  if (!Number.isFinite(capital) || capital <= 0) {
    return NextResponse.json({ error: "invalid capital" }, { status: 400 });
  }
  try {
    const data = await computeTodayAllocations({ capital, forceCryptoOn });
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
