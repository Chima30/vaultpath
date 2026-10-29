import { getDb } from "@/lib/supabase";
import { getMemwal } from "@/lib/memwal";
import { config } from "@/lib/config";
import { assess } from "@/lib/assess";
import { fail, ok } from "@/lib/http";
import type { Evidence, Investigation, TxSummary } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type Counterparty = { address: string; interactions: number };

// 1. load the newest stored Tatum evidence
// 2. recall related memories from Walrus Memory (real relayer call)
// 3. compare the two with the rule-based heuristic and store the assessment
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const db = getDb();

    const { data: inv, error: e1 } = await db.from("investigations").select("*").eq("id", id).maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!inv) return Response.json({ ok: false, error: "Investigation not found" }, { status: 404 });
    const subject = (inv as Investigation).subject_address;

    const { data: evRows, error: e2 } = await db
      .from("evidence")
      .select("*")
      .eq("investigation_id", id)
      .eq("kind", "tatum_transactions")
      .order("fetched_at", { ascending: false })
      .limit(1);
    if (e2) throw new Error(e2.message);
    const ev = (evRows?.[0] as Evidence | undefined);
    if (!ev) {
      return Response.json({ ok: false, error: "No Tatum evidence yet. Fetch on-chain evidence first." }, { status: 409 });
    }

    const payload = ev.payload as { transactions?: TxSummary[]; counterparties?: Counterparty[] };
    const counterparties = payload.counterparties ?? [];
    const txs = payload.transactions ?? [];

    // Recall: one query for the subject, plus one per top counterparty.
    // Embedding similarity on raw hex is fuzzy, so recalled TEXT is also matched
    // against exact addresses inside assess().
    const memwal = getMemwal();
    const queries = [
      `Sui address ${subject}`,
      ...counterparties.slice(0, 3).map((c) => `Sui address ${c.address}`),
    ];
    const settled = await Promise.all(
      queries.map((q) => memwal.recall({ query: q, limit: 6, namespace: config.memwal.namespace })),
    );

    const byBlob = new Map<string, { blob_id: string; distance: number; preview: string; text: string }>();
    for (const r of settled) {
      for (const m of r.results) {
        const prev = byBlob.get(m.blob_id);
        if (!prev || m.distance < prev.distance) {
          byBlob.set(m.blob_id, { blob_id: m.blob_id, distance: m.distance, preview: m.text.slice(0, 240), text: m.text });
        }
      }
    }
    const recalled = [...byBlob.values()].sort((a, b) => a.distance - b.distance);

    const out = assess({ subject, counterparties, transactionCount: txs.length, recalled });

    const { data: saved, error: e3 } = await db
      .from("assessments")
      .insert({
        investigation_id: id,
        verdict: out.verdict,
        score: out.score,
        summary: out.summary,
        reasoning: out.reasoning,
        recalled_count: recalled.length,
        recalled_context: recalled.map(({ blob_id, distance, preview }) => ({ blob_id, distance, preview })),
        evidence_ids: [ev.id],
      })
      .select("*")
      .single();
    if (e3) throw new Error(e3.message);

    return ok({ assessment: saved, matchedAddresses: out.matchedAddresses });
  } catch (e) {
    return fail(e);
  }
}
