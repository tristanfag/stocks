import { NextResponse } from "next/server";
import { getQuotes } from "@/lib/yahoo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbols = (searchParams.get("symbols") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!symbols.length) {
    return NextResponse.json({ error: "missing symbols" }, { status: 400 });
  }
  try {
    const quotes = await getQuotes(symbols);
    return NextResponse.json({ quotes });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
