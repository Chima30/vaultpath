import { z } from "zod";
import { getDb } from "@/lib/supabase";
import { normalizeAddress } from "@/lib/tatum";
import { fail, ok, HttpError } from "@/lib/http";
import { listInvestigations } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  subjectAddress: z.string().trim().min(1, "Subject address is required"),
  notes: z.string().trim().max(4000).optional(),
});

export async function GET() {
  const r = await listInvestigations();
  return r.ok ? ok(r.data) : fail(new Error(r.error));
}

export async function POST(req: Request) {
  try {
    const body = Body.parse(await req.json());
    const addr = normalizeAddress(body.subjectAddress);
    if (!addr) throw new HttpError(400, "Subject must be a Sui address: 0x followed by up to 64 hex characters.");
    const { data, error } = await getDb()
      .from("investigations")
      .insert({ title: body.title, subject_address: addr, notes: body.notes || null })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return ok(data, 201);
  } catch (e) {
    if (e instanceof HttpError) return Response.json({ ok: false, error: e.message }, { status: e.status });
    return fail(e);
  }
}
