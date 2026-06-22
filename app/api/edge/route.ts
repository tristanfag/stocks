import { NextResponse } from "next/server";
import { buildEdgeReport } from "@/lib/edge-engine";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const report = await buildEdgeReport();
    return NextResponse.json(report);
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
