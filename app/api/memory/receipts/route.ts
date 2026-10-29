import { listReceipts } from "@/lib/queries";
import { fail, ok } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const r = await listReceipts();
  return r.ok ? ok(r.data) : fail(new Error(r.error));
}
