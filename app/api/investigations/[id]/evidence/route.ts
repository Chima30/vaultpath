import { getDb } from "@/lib/supabase";
import { fetchSubjectEvidence } from "@/lib/tatum";
import { fail, ok } from "@/lib/http";
import type { Investigation } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// Pulls live evidence for the subject address from Tatum Sui Mainnet RPC and
// stores it. Rows are written only after the RPC calls have succeeded.
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const db = getDb();
    const { data: inv, error } = await db.from("investigations").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!inv) return Response.json({ ok: false, error: "Investigation not found" }, { status: 404 });
    const subject = (inv as Investigation).subject_address;

    const ev = await fetchSubjectEvidence(subject, 25);

    const rows = [
      {
        investigation_id: id,
        kind: "tatum_balances",
        source_methods: ["sui_getLatestCheckpointSequenceNumber", "suix_getAllBalances"],
        latest_checkpoint: ev.checkpoint,
        payload: { balances: ev.balances },
      },
      {
        investigation_id: id,
        kind: "tatum_transactions",
        source_methods: ["suix_queryTransactionBlocks"],
        latest_checkpoint: ev.checkpoint,
        payload: {
          transactions: ev.transactions,
          counterparties: ev.counterparties,
          hasMoreTransactions: ev.hasMoreTransactions,
          limit: 25,
        },
      },
    ];
    const ins = await db.from("evidence").insert(rows).select("id");
    if (ins.error) throw new Error(ins.error.message);

    return ok({
      checkpoint: ev.checkpoint,
      balanceCount: ev.balances.length,
      transactionCount: ev.transactions.length,
      counterpartyCount: ev.counterparties.length,
    });
  } catch (e) {
    return fail(e);
  }
}
