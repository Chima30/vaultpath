import { getDb } from "@/lib/supabase";
import { fetchSubjectEvidence } from "@/lib/tatum";
import { fail, ok } from "@/lib/http";
import type { Investigation } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// Pulls live evidence for the subject address from Tatum Sui Mainnet (gRPC) and
// stores it. A row is written only for data the node actually returned.
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const db = getDb();
    const { data: inv, error } = await db.from("investigations").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!inv) return Response.json({ ok: false, error: "Investigation not found" }, { status: 404 });
    const subject = (inv as Investigation).subject_address;

    const ev = await fetchSubjectEvidence(subject, 25);

    const meta = { protocol: "grpc", chain: ev.chain, networkVerified: ev.networkVerified };
    const rows: Record<string, unknown>[] = [
      {
        investigation_id: id,
        kind: "tatum_balances",
        source_methods: ["sui.rpc.v2.LedgerService/GetCheckpoint", "sui.rpc.v2.StateService/ListBalances"],
        latest_checkpoint: ev.checkpoint,
        payload: { ...meta, balances: ev.balances },
      },
    ];
    if (!ev.transactionsError) {
      rows.push({
        investigation_id: id,
        kind: "tatum_transactions",
        source_methods: ["sui.rpc.v2.LedgerService/ListTransactions"],
        latest_checkpoint: ev.checkpoint,
        payload: {
          ...meta,
          transactions: ev.transactions,
          counterparties: ev.counterparties,
          hasMoreTransactions: ev.hasMoreTransactions,
          limit: 25,
        },
      });
    }
    const ins = await db.from("evidence").insert(rows).select("id");
    if (ins.error) throw new Error(ins.error.message);

    if (ev.transactionsError) {
      return Response.json(
        {
          ok: false,
          code: "upstream_error",
          error: `Balances were stored, but transaction history failed: ${ev.transactionsError}`,
          data: { checkpoint: ev.checkpoint, balanceCount: ev.balances.length },
        },
        { status: 502 },
      );
    }

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
