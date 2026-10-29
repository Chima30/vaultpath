import { getDb } from "@/lib/supabase";
import { fail, ok } from "@/lib/http";
import { writeMemory } from "@/lib/write-memory";
import { short } from "@/lib/assess";
import type { Assessment, Investigation } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// Turns a stored assessment into a durable case memory so later investigations can recall it.
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const db = getDb();
    const { data: a, error } = await db.from("assessments").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!a) return Response.json({ ok: false, error: "Assessment not found" }, { status: 404 });
    const assessment = a as Assessment;

    const { data: inv, error: e2 } = await db.from("investigations").select("*").eq("id", assessment.investigation_id).maybeSingle();
    if (e2) throw new Error(e2.message);
    const investigation = inv as Investigation;

    const addrs = new Set<string>();
    for (const line of assessment.reasoning) for (const m of line.matchAll(/0x[0-9a-f]{64}/g)) addrs.add(m[0]);

    const text =
      `VaultPath case memory | case: ${investigation.title} | subject: ${investigation.subject_address} | ` +
      `verdict: ${assessment.verdict} (heuristic) | recorded: ${new Date().toISOString().slice(0, 10)} | ` +
      `finding: ${assessment.summary}` +
      (addrs.size ? ` | linked addresses: ${[...addrs].join(", ")}` : ` | subject ${short(investigation.subject_address)} reviewed, no linked addresses recorded`);

    const receipt = await writeMemory(text, { investigationId: investigation.id, assessmentId: assessment.id });
    return ok(receipt, 202);
  } catch (e) {
    return fail(e);
  }
}
