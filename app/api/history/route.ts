import { NextResponse } from "next/server";
import { getHistory, type HistoryRange } from "@/lib/yahoo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Must mirror HistoryRange in lib/yahoo.ts — an unlisted range silently fell
// back to "1mo", which made long-range callers think tickers had no history.
const ALLOWED = new Set<HistoryRange>(["1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "10y"]);

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol")?.trim();
  const rangeParam = (searchParams.get("range") || "1mo").trim();
  const range: HistoryRange = ALLOWED.has(rangeParam as HistoryRange) ? (rangeParam as HistoryRange) : "1mo";
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
