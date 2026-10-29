import { getMemwal } from "@/lib/memwal";
import { config } from "@/lib/config";
import { fail, ok } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Live relayer health plus an independent count of memories the relayer holds for
// this namespace. This is the source of truth for the "10 stored memories" goal,
// separate from our own Supabase receipts.
export async function GET() {
  try {
    const memwal = getMemwal();
    const health = await memwal.health();

    let count = 0;
    let cursor: string | undefined;
    let pages = 0;
    let more = true;
    while (more && pages < 10) {
      const page = await memwal.listMemories({ cursor, namespace: config.memwal.namespace, limit: 500 });
      count += page.memories.length;
      cursor = page.next_cursor ?? undefined;
      more = page.has_more;
      pages++;
    }
    return ok({ health, namespace: config.memwal.namespace, relayerUrl: config.memwal.relayerUrl, memoryCount: count, truncated: more });
  } catch (e) {
    return fail(e);
  }
}
