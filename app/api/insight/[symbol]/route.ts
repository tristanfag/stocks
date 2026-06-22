import { NextResponse } from "next/server";
import { buildInsight } from "@/lib/insight";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_req: Request, ctx: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await ctx.params;
  const decoded = decodeURIComponent(symbol);
  if (!decoded) return NextResponse.json({ error: "missing symbol" }, { status: 400 });
  try {
    const insight = await buildInsight(decoded);
    return NextResponse.json(insight);
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
