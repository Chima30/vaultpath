"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client-api";

export function InvestigationActions({ investigationId, latestAssessmentId, hasEvidence }: { investigationId: string; latestAssessmentId: string | null; hasEvidence: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  async function run(key: string, url: string, describe: (d: any) => string) { // eslint-disable-line @typescript-eslint/no-explicit-any
    setBusy(key);
    setMsg(null);
    const r = await api(url, "POST");
    setBusy(null);
    if (!r.ok) return setMsg({ tone: "bad", text: r.error });
    setMsg({ tone: "ok", text: describe(r.data) });
    router.refresh();
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button className="btn" disabled={!!busy} onClick={() => run("ev", `/api/investigations/${investigationId}/evidence`, (d) => `Fetched from Tatum at checkpoint ${d.checkpoint}: ${d.transactionCount} transactions, ${d.counterpartyCount} counterparties.`)}>
          {busy === "ev" ? "Fetching…" : "1. Fetch on-chain evidence"}
        </button>
        <button className="btn btn-primary" disabled={!!busy || !hasEvidence} onClick={() => run("as", `/api/investigations/${investigationId}/assess`, (d) => `Assessment stored: ${d.assessment.verdict}. ${d.assessment.recalled_count} memories recalled from Walrus.`)}>
          {busy === "as" ? "Recalling…" : "2. Recall memory and assess"}
        </button>
        <button className="btn" disabled={!!busy || !latestAssessmentId} onClick={() => run("mem", `/api/assessments/${latestAssessmentId}/memorize`, () => "Memory submitted to the Walrus relayer. Confirm it on the Case Memory page.")}>
          {busy === "mem" ? "Submitting…" : "3. Save finding to memory"}
        </button>
      </div>
      {msg && <p role="status" className={`mt-3 text-sm ${msg.tone === "ok" ? "text-ok" : "text-danger"}`}>{msg.text}</p>}
    </div>
  );
}
