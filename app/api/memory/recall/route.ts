import { z } from "zod";
import { getMemwal } from "@/lib/memwal";
import { config } from "@/lib/config";
import { fail, ok } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({
  query: z.string().trim().min(1, "Query is required").max(500),
  limit: z.number().int().min(1).max(20).optional(),
});

// Real semantic recall against Walrus Memory. Results are returned exactly as the
// relayer returns them (blob_id, decrypted text, cosine distance; lower = closer).
export async function POST(req: Request) {
  try {
    const body = Body.parse(await req.json());
    const r = await getMemwal().recall({ query: body.query, limit: body.limit ?? 8, namespace: config.memwal.namespace });
    return ok({ total: r.total, results: r.results });
  } catch (e) {
    return fail(e);
  }
}
