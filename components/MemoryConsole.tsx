"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client-api";
import { SAMPLE_MEMORIES } from "@/lib/sample-memories";

type Hit = { blob_id: string; text: string; distance: number };

export function MemoryConsole({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [hits, setHits] = useState<Hit[] | null>(null);

  async function write(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const text = String(new FormData(form).get("text") ?? "");
    setBusy("write"); setMsg(null);
    const r = await api("/api/memory/remember", "POST", { text });
    setBusy(null);
    if (!r.ok) return setMsg({ tone: "bad", text: r.error });
    form.reset();
    setMsg({ tone: "ok", text: "Accepted by the relayer. It is not stored until you press “Confirm pending writes”." });
    router.refresh();
  }

  async function loadSamples() {
    setBusy("samples"); setMsg(null);
    let accepted = 0;
    for (const text of SAMPLE_MEMORIES) {
      const r = await api("/api/memory/remember", "POST", { text });
      if (!r.ok) { setBusy(null); router.refresh(); return setMsg({ tone: "bad", text: `Stopped after ${accepted} accepted: ${r.error}` }); }
      accepted++;
    }
    setBusy(null);
    setMsg({ tone: "ok", text: `${accepted} writes accepted by the relayer. Press “Confirm pending writes” until they show as stored.` });
    router.refresh();
  }

  async function sync() {
    setBusy("sync"); setMsg(null);
    const r = await api<{ checked: number; done: number; failed: number; stillPending: number }>("/api/memory/sync", "POST");
    setBusy(null);
    if (!r.ok) return setMsg({ tone: "bad", text: r.error });
    setMsg({ tone: r.data.failed ? "bad" : "ok", text: `Checked ${r.data.checked}: ${r.data.done} stored, ${r.data.stillPending} still pending, ${r.data.failed} failed.` });
    router.refresh();
  }

  async function recall(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const query = String(new FormData(e.currentTarget).get("query") ?? "");
    setBusy("recall"); setMsg(null); setHits(null);
    const r = await api<{ results: Hit[] }>("/api/memory/recall", "POST", { query, limit: 8 });
    setBusy(null);
    if (!r.ok) return setMsg({ tone: "bad", text: r.error });
    setHits(r.data.results);
    if (r.data.results.length === 0) setMsg({ tone: "ok", text: "The relayer returned no matching memories." });
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-2">
        <button className="btn" disabled={disabled || !!busy} onClick={sync}>{busy === "sync" ? "Checking…" : "Confirm pending writes"}</button>
        <button className="btn" disabled={disabled || !!busy} onClick={loadSamples}>{busy === "samples" ? "Submitting…" : "Write 10 synthetic sample memories"}</button>
      </div>
      {msg && <p role="status" className={`text-sm ${msg.tone === "ok" ? "text-ok" : "text-danger"}`}>{msg.text}</p>}

      <form onSubmit={write} className="space-y-3">
        <label className="label" htmlFor="text">Write a case memory</label>
        <textarea id="text" name="text" required rows={4} maxLength={1500} className="field" disabled={disabled}
          placeholder="Case: … | flagged address: 0x… (write the full address) | finding: …" />
        <button className="btn btn-primary" disabled={disabled || !!busy}>{busy === "write" ? "Submitting…" : "Write to Walrus Memory"}</button>
      </form>

      <form onSubmit={recall} className="space-y-3">
        <label className="label" htmlFor="query">Recall from memory</label>
        <div className="flex gap-2">
          <input id="query" name="query" required maxLength={500} className="field" disabled={disabled} placeholder="fan-out after a large inbound transfer" />
          <button className="btn" disabled={disabled || !!busy}>{busy === "recall" ? "Searching…" : "Recall"}</button>
        </div>
        {hits && hits.length > 0 && (
          <ul className="space-y-2">
            {hits.map((h) => (
              <li key={h.blob_id} className="rounded-md border border-line bg-raised p-3 text-sm">
                <p className="text-text">{h.text}</p>
                <p className="mt-1.5 font-mono text-xs text-muted">blob {h.blob_id.slice(0, 18)}… · distance {h.distance.toFixed(3)} (lower is closer)</p>
              </li>
            ))}
          </ul>
        )}
      </form>
    </div>
  );
}
