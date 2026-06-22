import { NextResponse } from "next/server";
import { buildScreenerReport } from "@/lib/screener-engine";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const report = await buildScreenerReport();
    return NextResponse.json(report);
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
