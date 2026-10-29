import { configStatus } from "@/lib/config";
import { ok } from "@/lib/http";

export const runtime = "nodejs";

// Reports which integrations have credentials set. Booleans only, never values.
// It does NOT contact any external service, so "configured" is not "working".
export async function GET() {
  return ok(configStatus());
}
