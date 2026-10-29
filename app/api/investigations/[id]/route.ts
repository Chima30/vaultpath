import { getInvestigation } from "@/lib/queries";
import { fail, ok } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const r = await getInvestigation(id);
  return r.ok ? ok(r.data) : fail(new Error(r.error));
}
