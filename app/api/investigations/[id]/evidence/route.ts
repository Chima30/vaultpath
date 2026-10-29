import { getDb } from "@/lib/supabase";
import { fetchSubjectEvidence } from "@/lib/tatum";
import { fail } from "@/lib/http";
import type { Investigation } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// Pulls live evidence for the subject address from Tatum Sui Mainnet (gRPC) and stores it.
// A row is written only for data the node actually returned. If balances or history could
// not be retrieved (for example Tatum rate limited the request), that part is NOT stored,
// the response is an error that says exactly what was and was not stored, and no value is
// ever substituted.
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
    const rows: Record<string, unknown>[] = [];
    if (ev.balances) {
      rows.push({
        investigation_id: id,
        kind: "tatum_balances",
        source_methods: ["sui.rpc.v2.LedgerService/GetCheckpoint", "sui.rpc.v2.StateService/ListBalances"],
        latest_checkpoint: ev.checkpoint,
        payload: { ...meta, balances: ev.balances },
      });
    }
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
    if (rows.length > 0) {
      const ins = await db.from("evidence").insert(rows).select("id");
      if (ins.error) throw new Error(ins.error.message);
    }

    const failures = [
      ev.balancesError && { part: "balances", ...ev.balancesError },
      ev.transactionsError && { part: "transaction history", ...ev.transactionsError },
    ].filter(Boolean) as { part: string; message: string; kind: string; retryAfterMs: number | null }[];

    if (failures.length > 0) {
      const stored = [ev.balances && "balances", !ev.transactionsError && "transaction history"].filter(Boolean).join(" and ") || "nothing";
      const limited = failures.some((f) => f.kind === "rate_limited");
      const text =
        `Stored: ${stored}. Not stored: ${failures.map((f) => f.part).join(" and ")}. ` +
        failures.map((f) => `${f.part}: ${f.message}`).join(" ") +
        (limited ? " Wait a few seconds and press the button again." : "");
      return Response.json(
        {
          ok: false,
          code: limited ? "rate_limited" : "upstream_error",
          error: text,
          data: { checkpoint: ev.checkpoint, balancesStored: Boolean(ev.balances), transactionsStored: !ev.transactionsError },
        },
        { status: limited ? 429 : 502 },
      );
    }

    return Response.json({
      ok: true,
      data: {
        checkpoint: ev.checkpoint,
        balanceCount: ev.balances?.length ?? 0,
        transactionCount: ev.transactions.length,
        counterpartyCount: ev.counterparties.length,
      },
    });
  } catch (e) {
    return fail(e);
  }
}
