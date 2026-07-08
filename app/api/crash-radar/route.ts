import { NextResponse } from "next/server";
import { buildCrashRadar } from "@/lib/crash-radar";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 120;

export async function GET(req: Request) {
  const force = new URL(req.url).searchParams.get("force") === "1";
  try {
    const report = await buildCrashRadar(force);
    return NextResponse.json(report);
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
