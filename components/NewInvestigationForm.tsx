"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client-api";

export function NewInvestigationForm({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const r = await api<{ id: string }>("/api/investigations", "POST", {
      title: f.get("title"),
      subjectAddress: f.get("subjectAddress"),
      notes: f.get("notes") || undefined,
    });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    router.push(`/investigations/${r.data.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="label" htmlFor="title">Case title</label>
        <input id="title" name="title" required maxLength={200} className="field" placeholder="Wallet cluster review" />
      </div>
      <div>
        <label className="label" htmlFor="subjectAddress">Subject Sui address</label>
        <input id="subjectAddress" name="subjectAddress" required className="field font-mono" placeholder="0x…" spellCheck={false} autoComplete="off" />
      </div>
      <div>
        <label className="label" htmlFor="notes">Notes (optional)</label>
        <textarea id="notes" name="notes" rows={3} maxLength={4000} className="field" />
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <button className="btn btn-primary" disabled={busy || disabled}>{busy ? "Creating…" : "Open investigation"}</button>
    </form>
  );
}
