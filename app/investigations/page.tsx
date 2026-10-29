import Link from "next/link";
import { configStatus } from "@/lib/config";
import { listInvestigations } from "@/lib/queries";
import { Badge, Notice, NotConfigured, PageHeader, Panel } from "@/components/ui";
import { NewInvestigationForm } from "@/components/NewInvestigationForm";
import { shortAddr, when } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function InvestigationsPage() {
  const cfg = configStatus();
  const res = cfg.supabase ? await listInvestigations() : null;

  return (
    <>
      <PageHeader title="Investigations">Each case tracks one Sui address, the live evidence pulled for it, and every assessment made against recalled memory.</PageHeader>
      {!cfg.supabase && <div className="mb-6"><NotConfigured what="Supabase" vars={["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]} /></div>}
      {res && !res.ok && <div className="mb-6"><Notice tone="bad" title="Could not load investigations">{res.error}</Notice></div>}

      <div className="grid gap-6 lg:grid-cols-5">
        <Panel title="All cases" className="lg:col-span-3">
          {res?.ok && res.data.length > 0 ? (
            <ul className="divide-y divide-line">
              {res.data.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div className="min-w-0">
                    <Link href={`/investigations/${i.id}`} className="text-text hover:text-tide">{i.title}</Link>
                    <p className="font-mono text-xs text-muted">{shortAddr(i.subject_address)} · {when(i.created_at)}</p>
                  </div>
                  <Badge tone={i.status === "open" ? "info" : "neutral"}>{i.status}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">{cfg.supabase ? "No investigations yet. Open one with the form." : "Connect Supabase to store investigations."}</p>
          )}
        </Panel>
        <Panel title="Open an investigation" className="lg:col-span-2">
          <NewInvestigationForm disabled={!cfg.supabase} />
        </Panel>
      </div>
    </>
  );
}
