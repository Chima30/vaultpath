import { z } from "zod";
import { fail, ok, HttpError } from "@/lib/http";
import { writeMemory } from "@/lib/write-memory";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({
  text: z.string().min(1, "Memory text is required"),
  investigationId: z.string().uuid().optional(),
});

export async function POST(req: Request) {
  try {
    const body = Body.parse(await req.json());
    const receipt = await writeMemory(body.text, { investigationId: body.investigationId });
    return ok(receipt, 202);
  } catch (e) {
    if (e instanceof HttpError) return Response.json({ ok: false, error: e.message }, { status: e.status });
    return fail(e);
  }
}
