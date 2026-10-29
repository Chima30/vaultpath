import { NextResponse } from "next/server";
import { tatumStatus } from "@/lib/tatum";
import { fail, ok } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Live check against Tatum Sui Mainnet gRPC. Four real calls are made
// (GetServiceInfo, GetCheckpoint, ListBalances, ListTransactions) and each result
// is reported separately. HTTP 200 means overall "ok" or "degraded"; a total
// failure returns 502 with the per-call errors, never a success payload.
export async function GET() {
  try {
    const s = await tatumStatus();
    if (s.overall === "failed") {
      const first = s.probes.find((p) => !p.ok)?.error ?? "Sui Mainnet could not be confirmed";
      return NextResponse.json({ ok: false, code: "upstream_error", error: first, data: s }, { status: 502 });
    }
    return ok(s);
  } catch (e) {
    return fail(e);
  }
}
