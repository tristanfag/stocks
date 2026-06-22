import { NextResponse } from "next/server";
import { getNewsForSymbols } from "@/lib/yahoo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbols = (searchParams.get("symbols") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const perSymbol = Number(searchParams.get("perSymbol") || "4");
  if (!symbols.length) {
    return NextResponse.json({ error: "missing symbols" }, { status: 400 });
  }
  try {
    const news = await getNewsForSymbols(symbols, perSymbol);
    return NextResponse.json({ news });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
