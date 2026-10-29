import { configStatus } from "@/lib/config";
import { listReceipts } from "@/lib/queries";
import { Badge, Notice, NotConfigured, PageHeader, Panel } from "@/components/ui";
import { MemoryConsole } from "@/components/MemoryConsole";
import { VaultSlots } from "@/components/VaultSlots";
import { when } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function MemoryPage() {
  const cfg = configStatus();
  const res = cfg.supabase ? await listReceipts() : null;

  return (
    <>
      <PageHeader title="Case Memory">
        Memories live in Walrus Memory on Mainnet, encrypted with Seal. Supabase keeps only a receipt for each write. The browser stores nothing.
      </PageHeader>

      {!cfg.memwal && <div className="mb-6"><NotConfigured what="Walrus Memory" vars={["MEMWAL_ACCOUNT_ID", "MEMWAL_DELEGATE_KEY"]} /></div>}
      {!cfg.supabase && <div className="mb-6"><NotConfigured what="Supabase" vars={["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]} /></div>}
      {cfg.memwal && !cfg.relayerIsMainnet && (
        <div className="mb-6"><Notice tone="bad" title="Relayer is not the Mainnet relayer">MEMWAL_RELAYER_URL points at {cfg.relayerUrl}. Hackathon proof requires https://relayer.memory.walrus.xyz.</Notice></div>
      )}
      {res && !res.ok && <div className="mb-6"><Notice tone="bad" title="Could not load receipts">{res.error}</Notice></div>}

      <Panel title="Confirmed memories" className="mb-6">
        <VaultSlots receipts={res?.ok ? res.data : []} />
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Write and recall">
          <MemoryConsole disabled={!cfg.memwal || !cfg.supabase} />
        </Panel>
        <Panel title="Write receipts">
          {res?.ok && res.data.length > 0 ? (
            <ul className="space-y-3">
              {res.data.map((r) => (
                <li key={r.id} className="rounded-md border border-line bg-raised p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <Badge tone={r.status === "done" ? "ok" : r.status === "failed" ? "bad" : "warn"}>{r.status === "done" ? "stored" : r.status === "accepted" ? "pending" : r.status}</Badge>
                    <span className="text-xs text-muted">{when(r.created_at)}</span>
                  </div>
                  <p className="mt-2 text-text">{r.content_preview}</p>
                  <p className="mt-1.5 break-all font-mono text-xs text-muted">{r.blob_id ? `blob ${r.blob_id}` : `job ${r.job_id}`}</p>
                  {r.error && <p className="mt-1 text-xs text-danger">{r.error}</p>}
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted">No writes yet.</p>}
        </Panel>
      </div>
    </>
  );
}
