import { getDb } from "@/lib/supabase";
import { getMemwal } from "@/lib/memwal";
import { fail, ok } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 60;

// Asks the relayer for the real state of every receipt still marked 'accepted'.
// A receipt becomes 'done' only when the relayer returns status 'done' AND a blob_id.
export async function POST() {
  try {
    const db = getDb();
    const memwal = getMemwal();
    const { data, error } = await db.from("walrus_write_receipts").select("id, job_id").eq("status", "accepted").limit(50);
    if (error) throw new Error(error.message);

    let done = 0, failed = 0, stillPending = 0;
    for (const row of data ?? []) {
      const s = await memwal.getRememberStatus(row.job_id);
      if (s.status === "done" && s.blob_id) {
        await db.from("walrus_write_receipts").update({
          status: "done", blob_id: s.blob_id, owner_address: s.owner ?? null, confirmed_at: new Date().toISOString(), error: null,
        }).eq("id", row.id);
        done++;
      } else if (s.status === "failed" || s.status === "not_found") {
        await db.from("walrus_write_receipts").update({
          status: "failed", error: s.error ?? `relayer reported ${s.status}`,
        }).eq("id", row.id);
        failed++;
      } else {
        stillPending++;
      }
    }
    return ok({ checked: data?.length ?? 0, done, failed, stillPending });
  } catch (e) {
    return fail(e);
  }
}
