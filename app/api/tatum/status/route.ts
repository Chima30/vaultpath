import { tatumStatus } from "@/lib/tatum";
import { fail, ok } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Live call to Tatum Sui Mainnet RPC. Succeeds only if Tatum really answers.
export async function GET() {
  try {
    return ok(await tatumStatus());
  } catch (e) {
    return fail(e);
  }
}
