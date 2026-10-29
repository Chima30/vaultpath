import "server-only";
import { getDb } from "./supabase";
import { getMemwal, sha256, MAX_MEMORY_CHARS } from "./memwal";
import { config } from "./config";
import { HttpError } from "./http";
import type { Receipt } from "./types";

// Submits one memory to the Walrus Memory relayer on Mainnet and records a receipt.
// The receipt is created as 'accepted' with NO blob_id. Only /api/memory/sync can
// promote it to 'done', and only after the relayer itself reports the job done.
export async function writeMemory(
  text: string,
  link: { investigationId?: string | null; assessmentId?: string | null } = {},
): Promise<Receipt> {
  const clean = text.trim();
  if (!clean) throw new HttpError(400, "Memory text is empty");
  if (clean.length > MAX_MEMORY_CHARS) throw new HttpError(400, `Memory text is too long (max ${MAX_MEMORY_CHARS} characters)`);

  const accepted = await getMemwal().remember(clean, config.memwal.namespace);

  const { data, error } = await getDb()
    .from("walrus_write_receipts")
    .insert({
      investigation_id: link.investigationId ?? null,
      assessment_id: link.assessmentId ?? null,
      namespace: config.memwal.namespace,
      job_id: accepted.job_id,
      status: "accepted",
      content_sha256: sha256(clean),
      content_preview: clean.slice(0, 200),
    })
    .select("*")
    .single();
  if (error) {
    // The relayer accepted the write but we could not record it. Say so loudly.
    throw new Error(`Relayer accepted job ${accepted.job_id} but the receipt could not be saved: ${error.message}`);
  }
  return data as Receipt;
}
