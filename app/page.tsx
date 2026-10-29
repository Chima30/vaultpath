import Link from "next/link";
import { configStatus } from "@/lib/config";
import { listInvestigations, listReceipts, overviewCounts } from "@/lib/queries";
import { Badge, Notice, NotConfigured, PageHeader, Panel } from "@/components/ui";
import { VaultSlots } from "@/components/VaultSlots";
import { StatusPanel } from "@/components/StatusPanel";
import { shortAddr, when } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const cfg = configStatus();
  const [counts, receipts, invs] = cfg.supabase
    ? await Promise.all([overviewCounts(), listReceipts(), listInvestigations()])
    : [null, null, null];

  const c = counts?.ok ? counts.data : null;
  const confirmed = c?.confirmed ?? 0;

  const proof = [
    { label: "At least 10 memories confirmed stored on Walrus Mainnet", done: confirmed >= 10, detail: c ? `${confirmed} confirmed` : "no data" },
    { label: "Live evidence fetched from Tatum Sui Mainnet RPC", done: (c?.evidence ?? 0) > 0, detail: c ? `${c.evidence} evidence records` : "no data" },
    { label: "An assessment that used recalled memory", done: (c?.assessmentsWithMemory ?? 0) > 0, detail: c ? `${c.assessmentsWithMemory} assessments` : "no data" },
  ];

  return (
    <>
      <PageHeader title="Overview">
        Investigations are checked against what earlier cases taught the workspace. Everything below is read from your database; empty means nothing real has happened yet.
      </PageHeader>

      {!cfg.supabase && (
        <div className="mb-6"><NotConfigured what="Supabase" vars={["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]} /></div>
      )}
      {counts && !counts.ok && (
        <div className="mb-6"><Notice tone="bad" title="Database query failed">{counts.error}. Check that migration 0001_init.sql has been applied.</Notice></div>
      )}

      <Panel title="Walrus memory vault" className="mb-6">
        {receipts?.ok ? <VaultSlots receipts={receipts.data} /> : <VaultSlots receipts={[]} />}
        {(c?.pending ?? 0) > 0 && (
          <p className="mt-2 text-sm text-brass">{c?.pending} write{c?.pending === 1 ? "" : "s"} accepted by the relayer but not yet confirmed. Open Case Memory to confirm.</p>
        )}
      </Panel>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Integration checks">
          <StatusPanel configured={{ tatum: cfg.tatum, memwal: cfg.memwal }} />
        </Panel>
        <Panel title="Hackathon proof, computed from stored data">
          <ul className="space-y-3">
            {proof.map((p) => (
              <li key={p.label} className="flex items-start justify-between gap-3 text-sm">
                <span className="text-text">{p.label}</span>
                <span className="shrink-0">{p.done ? <Badge tone="ok">met · {p.detail}</Badge> : <Badge tone="warn">not met · {p.detail}</Badge>}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel title="Recent investigations" action={<Link href="/investigations" className="text-sm text-tide hover:underline">View all</Link>}>
        {invs?.ok && invs.data.length > 0 ? (
          <ul className="divide-y divide-line">
            {invs.data.slice(0, 6).map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <Link href={`/investigations/${i.id}`} className="text-text hover:text-tide">{i.title}</Link>
                  <p className="font-mono text-xs text-muted">{shortAddr(i.subject_address)}</p>
                </div>
                <span className="text-xs text-muted">{when(i.created_at)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No investigations yet. <Link href="/investigations" className="text-tide hover:underline">Open the first one.</Link></p>
        )}
      </Panel>
    </>
  );
}
