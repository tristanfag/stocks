import { NextResponse } from "next/server";
import { buildTrendReport } from "@/lib/trend-engine";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const report = await buildTrendReport();
    return NextResponse.json(report);
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
