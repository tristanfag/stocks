import { NextResponse } from "next/server";
import { buildRecommendations } from "@/lib/recommendations";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 120; // route compute can be expensive on first call

export async function GET(req: Request) {
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";
  try {
    const report = await buildRecommendations(force);
    return NextResponse.json(report);
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
