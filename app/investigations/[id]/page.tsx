import Link from "next/link";
import { notFound } from "next/navigation";
import { configStatus } from "@/lib/config";
import { getInvestigation } from "@/lib/queries";
import { Badge, Notice, NotConfigured, PageHeader, Panel, VerdictBadge } from "@/components/ui";
import { InvestigationActions } from "@/components/InvestigationActions";
import { shortAddr, when } from "@/lib/format";
import type { TxSummary } from "@/lib/types";

export const dynamic = "force-dynamic";

type Cp = { address: string; interactions: number };

export default async function InvestigationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cfg = configStatus();
  if (!cfg.supabase) return <NotConfigured what="Supabase" vars={["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]} />;

  const res = await getInvestigation(id);
  if (!res.ok) {
    if (res.error === "Investigation not found") notFound();
    return <Notice tone="bad" title="Could not load this investigation">{res.error}</Notice>;
  }
  const { inv, evidence, assessments, receipts } = res.data;
  const txEv = evidence.find((e) => e.kind === "tatum_transactions");
  const balEv = evidence.find((e) => e.kind === "tatum_balances");
  const txs = ((txEv?.payload as { transactions?: TxSummary[] } | undefined)?.transactions) ?? [];
  const cps = ((txEv?.payload as { counterparties?: Cp[] } | undefined)?.counterparties) ?? [];
  const balances = ((balEv?.payload as { balances?: { coinType: string; totalBalance: string }[] } | undefined)?.balances) ?? [];
  const latest = assessments[0];

  return (
    <>
      <p className="mb-2 text-sm"><Link href="/investigations" className="text-tide hover:underline">Investigations</Link></p>
      <PageHeader title={inv.title}>
        <span className="break-all font-mono text-xs">{inv.subject_address}</span>
      </PageHeader>
      {inv.notes && <p className="mb-6 max-w-2xl text-sm text-muted">{inv.notes}</p>}

      <Panel title="Workflow" className="mb-6">
        <InvestigationActions investigationId={inv.id} latestAssessmentId={latest?.id ?? null} hasEvidence={!!txEv} />
        {!cfg.tatum && <div className="mt-4"><NotConfigured what="Tatum" vars={["TATUM_API_KEY"]} /></div>}
        {!cfg.memwal && <div className="mt-4"><NotConfigured what="Walrus Memory" vars={["MEMWAL_ACCOUNT_ID", "MEMWAL_DELEGATE_KEY"]} /></div>}
      </Panel>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Latest assessment">
          {latest ? (
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2"><VerdictBadge verdict={latest.verdict} /><span className="text-muted">score {latest.score} · {latest.method} · {when(latest.created_at)}</span></div>
              <p className="text-text">{latest.summary}</p>
              <ul className="list-disc space-y-1 pl-5 text-muted">{latest.reasoning.map((r, i) => <li key={i}>{r}</li>)}</ul>
              <p className="text-xs text-muted">Rule-based heuristic. A match is a lead to verify, not proof about any address owner.</p>
            </div>
          ) : <p className="text-sm text-muted">No assessment yet. Fetch evidence, then run step 2.</p>}
        </Panel>
        <Panel title={`Recalled history (${latest?.recalled_count ?? 0})`}>
          {latest && latest.recalled_context.length > 0 ? (
            <ul className="space-y-2">
              {latest.recalled_context.map((m) => (
                <li key={m.blob_id} className="rounded-md border border-line bg-raised p-3 text-sm">
                  <p className="text-text">{m.preview}</p>
                  <p className="mt-1 font-mono text-xs text-muted">blob {m.blob_id.slice(0, 16)}… · distance {m.distance.toFixed(3)}</p>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted">{latest ? "Walrus Memory returned nothing relevant for this case." : "Nothing recalled yet."}</p>}
        </Panel>
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Balances (Tatum)" action={balEv ? <Badge>checkpoint {balEv.latest_checkpoint}</Badge> : undefined}>
          {balances.length > 0 ? (
            <ul className="space-y-1.5 text-sm">{balances.map((b) => <li key={b.coinType} className="flex justify-between gap-3"><span className="min-w-0 truncate font-mono text-xs text-muted" title={b.coinType}>{b.coinType}</span><span className="font-mono text-text">{b.totalBalance}</span></li>)}</ul>
          ) : <p className="text-sm text-muted">{balEv ? "The address holds no coins." : txEv ? "Balances are not stored for this case: the balance request did not succeed on the last fetch (for example it was rate limited). Fetch evidence again in a few seconds." : "No evidence fetched yet."}</p>}
        </Panel>
        <Panel title={`Counterparties (${cps.length})`}>
          {cps.length > 0 ? (
            <ul className="space-y-1.5 text-sm">{cps.slice(0, 12).map((c) => <li key={c.address} className="flex justify-between"><span className="font-mono text-xs text-text">{shortAddr(c.address)}</span><span className="text-muted">{c.interactions}×</span></li>)}</ul>
          ) : <p className="text-sm text-muted">{txEv ? "No counterparties in the fetched window." : "No evidence fetched yet."}</p>}
        </Panel>
      </div>

      <Panel title={`Recent transactions (${txs.length})`} className="mb-6">
        {txs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted"><tr><th className="py-2 pr-4 font-normal">Digest</th><th className="py-2 pr-4 font-normal">Sender</th><th className="py-2 font-normal">Time</th></tr></thead>
              <tbody className="divide-y divide-line">
                {txs.map((t) => (
                  <tr key={t.digest}>
                    <td className="py-2 pr-4 font-mono text-xs text-text">{t.digest.slice(0, 14)}…</td>
                    <td className="py-2 pr-4 font-mono text-xs text-muted">{t.sender ? shortAddr(t.sender) : "-"}</td>
                    <td className="py-2 text-xs text-muted">{t.timestampMs ? when(new Date(Number(t.timestampMs)).toISOString()) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="text-sm text-muted">No transactions stored yet.</p>}
      </Panel>

      <Panel title="Memory writes from this case">
        {receipts.length > 0 ? (
          <ul className="space-y-2 text-sm">{receipts.map((r) => <li key={r.id} className="flex flex-wrap items-center justify-between gap-2"><span className="min-w-0 truncate text-muted">{r.content_preview}</span><Badge tone={r.status === "done" ? "ok" : r.status === "failed" ? "bad" : "warn"}>{r.status}</Badge></li>)}</ul>
        ) : <p className="text-sm text-muted">Nothing written to memory from this case yet.</p>}
      </Panel>
    </>
  );
}
