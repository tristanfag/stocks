import { NextResponse } from "next/server";
import { getHistory } from "@/lib/yahoo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ALLOWED = new Set(["1d", "5d", "1mo", "3mo", "6mo", "1y"] as const);

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol")?.trim();
  const rangeParam = (searchParams.get("range") || "1mo").trim();
  const range = (ALLOWED.has(rangeParam as any) ? rangeParam : "1mo") as
    "1d" | "5d" | "1mo" | "3mo" | "6mo" | "1y";
  if (!symbol) {
    return NextResponse.json({ error: "missing symbol" }, { status: 400 });
  }
  try {
    const candles = await getHistory(symbol, range);
    return NextResponse.json({ symbol, range, candles });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
