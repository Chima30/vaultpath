import { configStatus } from "@/lib/config";
import { Badge, Notice, PageHeader, Panel } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const cfg = configStatus();
  const rows: { name: string; vars: string; set: boolean }[] = [
    { name: "Access gate", vars: "VAULTPATH_ACCESS_PASSWORD", set: cfg.accessGate },
    { name: "Supabase", vars: "SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY", set: cfg.supabase },
    { name: "Walrus Memory", vars: "MEMWAL_ACCOUNT_ID, MEMWAL_DELEGATE_KEY", set: cfg.memwal },
    { name: "Tatum", vars: "TATUM_API_KEY", set: cfg.tatum },
  ];

  return (
    <>
      <PageHeader title="Settings">Read-only view of the deployment. Secrets are set in Vercel and are never displayed or sent to the browser.</PageHeader>

      <Panel title="Credentials" className="mb-6">
        <ul className="divide-y divide-line">
          {rows.map((r) => (
            <li key={r.name} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
              <div><p className="text-text">{r.name}</p><p className="font-mono text-xs text-muted">{r.vars}</p></div>
              {r.set ? <Badge tone="ok">present</Badge> : <Badge tone="warn">missing</Badge>}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">“Present” only means the variable has a value. Use the live checks on Overview to test it against the real service.</p>
      </Panel>

      <Panel title="Endpoints" className="mb-6">
        <dl className="space-y-3 text-sm">
          <div><dt className="text-muted">Walrus Memory relayer</dt><dd className="break-all font-mono text-xs text-text">{cfg.relayerUrl} {cfg.relayerIsMainnet ? <Badge tone="ok">mainnet</Badge> : <Badge tone="bad">not mainnet</Badge>}</dd></div>
          <div><dt className="text-muted">Memory namespace</dt><dd className="font-mono text-xs text-text">{cfg.namespace}</dd></div>
          <div><dt className="text-muted">Tatum Sui Mainnet (gRPC)</dt><dd className="break-all font-mono text-xs text-text">{cfg.tatumTarget} {cfg.tatumIsMainnet ? <Badge tone="ok">mainnet host</Badge> : <Badge tone="bad">not the Tatum mainnet gRPC host</Badge>}</dd></div>
          {cfg.tatumLegacyRpcUrlSet && <div><dt className="text-muted">TATUM_SUI_RPC_URL</dt><dd className="text-xs text-brass">Set but ignored. Sui JSON-RPC is no longer used; you can delete this variable.</dd></div>}
        </dl>
      </Panel>

      <Panel title="Incomplete or untested">
        <div className="space-y-3">
          <Notice title="Not yet tested against the real services">
            Walrus Memory writes and recall were written from the official documentation. The Tatum gRPC client (GetServiceInfo, GetCheckpoint, ListBalances, ListTransactions) was checked against a local mock gRPC server only, not against Tatum. Use the live checks on Overview: a green Tatum badge appears only after Tatum itself answers all four calls.
          </Notice>
          <Notice title="Single-operator access only">
            The access gate is one shared password. There are no per-user accounts, so row-level policies deny all direct database access instead of scoping rows to a user.
          </Notice>
          <Notice title="Heuristic assessments">
            Assessments are a transparent rule-based comparison between recalled memory text and on-chain counterparties. There is no machine-learning model, and a match is a lead rather than proof.
          </Notice>
          <Notice title="Transaction history depends on a newer Sui gRPC method">
            Address history uses LedgerService/ListTransactions, a recent addition to the Sui gRPC API. If Tatum&apos;s node does not serve it, evidence fetch stores balances only and reports the error instead of inventing history.
          </Notice>
        </div>
      </Panel>
    </>
  );
}
