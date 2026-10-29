import "server-only";
import { getDb } from "./supabase";
import { errorMessage } from "./errors";
import type { Assessment, Evidence, Investigation, Receipt } from "./types";

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function wrap<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

function check<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}

export const listInvestigations = () =>
  wrap(async () =>
    check(await getDb().from("investigations").select("*").order("created_at", { ascending: false }).limit(200)) as Investigation[],
  );

export const getInvestigation = (id: string) =>
  wrap(async () => {
    const db = getDb();
    const inv = check(await db.from("investigations").select("*").eq("id", id).maybeSingle()) as Investigation | null;
    if (!inv) throw new Error("Investigation not found");
    const evidence = check(await db.from("evidence").select("*").eq("investigation_id", id).order("fetched_at", { ascending: false })) as Evidence[];
    const assessments = check(await db.from("assessments").select("*").eq("investigation_id", id).order("created_at", { ascending: false })) as Assessment[];
    const receipts = check(await db.from("walrus_write_receipts").select("*").eq("investigation_id", id).order("created_at", { ascending: false })) as Receipt[];
    return { inv, evidence, assessments, receipts };
  });

export const listReceipts = () =>
  wrap(async () =>
    check(await getDb().from("walrus_write_receipts").select("*").order("created_at", { ascending: false }).limit(200)) as Receipt[],
  );

export const overviewCounts = () =>
  wrap(async () => {
    const db = getDb();
    const count = async (table: string, filter?: (q: any) => any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      let q = db.from(table).select("id", { count: "exact", head: true });
      if (filter) q = filter(q);
      const { count: c, error } = await q;
      if (error) throw new Error(error.message);
      return c ?? 0;
    };
    const [investigations, evidence, assessments, confirmed, pending, assessmentsWithMemory] = await Promise.all([
      count("investigations"),
      count("evidence", (q) => q.in("kind", ["tatum_balances", "tatum_transactions"])),
      count("assessments"),
      count("walrus_write_receipts", (q) => q.eq("status", "done").not("blob_id", "is", null)),
      count("walrus_write_receipts", (q) => q.eq("status", "accepted")),
      count("assessments", (q) => q.gt("recalled_count", 0)),
    ]);
    return { investigations, evidence, assessments, confirmed, pending, assessmentsWithMemory };
  });
