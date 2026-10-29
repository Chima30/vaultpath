"use client";
import { useState } from "react";
import { api } from "@/lib/client-api";
import { Badge } from "./ui";

type Probe = { name: string; ok: boolean; ms: number; detail?: string; error?: string };
type TatumData = { overall: "ok" | "degraded" | "failed"; endpoint: string; chain: string | null; networkVerified: boolean; latestCheckpoint: string | null; probes: Probe[] };
type Check = { state: "idle" | "running" | "ok" | "warn" | "fail"; detail?: string; probes?: Probe[] };

export function StatusPanel({ configured }: { configured: { tatum: boolean; memwal: boolean } }) {
  const [tatum, setTatum] = useState<Check>({ state: "idle" });
  const [mem, setMem] = useState<Check>({ state: "idle" });

  async function checkTatum() {
    setTatum({ state: "running" });
    const r = await api<TatumData>("/api/tatum/status", "GET");
    const d = (r.ok ? r.data : (r.data as TatumData | undefined)) ?? undefined;
    if (!r.ok) return setTatum({ state: "fail", detail: r.error, probes: d?.probes });
    const summary = `${d!.endpoint} · chain ${d!.chain ?? "unknown"} · latest checkpoint ${d!.latestCheckpoint ?? "?"}`;
    if (d!.overall === "ok") return setTatum({ state: "ok", detail: summary, probes: d!.probes });
    setTatum({ state: "warn", detail: `Reachable but not fully verified. ${summary}`, probes: d!.probes });
  }

  async function checkMem() {
    setMem({ state: "running" });
    const r = await api<{ health: { status: string }; memoryCount: number; namespace: string }>("/api/memory/status", "GET");
    if (!r.ok) return setMem({ state: "fail", detail: r.error });
    setMem({ state: "ok", detail: `relayer ${r.data.health.status}; ${r.data.memoryCount} memories in namespace "${r.data.namespace}"` });
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Row name="Tatum Sui Mainnet (gRPC)" configured={configured.tatum} check={tatum} onCheck={checkTatum} />
      <Row name="Walrus Memory relayer" configured={configured.memwal} check={mem} onCheck={checkMem} />
    </div>
  );
}

function Row({ name, configured, check, onCheck }: { name: string; configured: boolean; check: Check; onCheck: () => void }) {
  return (
    <div className="rounded-md border border-line bg-raised p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-text">{name}</p>
        {!configured ? <Badge tone="warn">not configured</Badge>
          : check.state === "ok" ? <Badge tone="ok">verified just now</Badge>
          : check.state === "warn" ? <Badge tone="warn">partly working</Badge>
          : check.state === "fail" ? <Badge tone="bad">check failed</Badge>
          : <Badge>configured, unverified</Badge>}
      </div>
      {check.detail && <p className={`mt-2 break-words text-xs ${check.state === "fail" ? "text-danger" : "text-muted"}`}>{check.detail}</p>}
      {check.probes && (
        <ul className="mt-2 space-y-1 text-xs">
          {check.probes.map((p) => (
            <li key={p.name} className={p.ok ? "text-muted" : "text-danger"}>
              <span className="font-mono">{p.ok ? "✓" : "✗"} {p.name}</span>
              <span className="block break-words pl-4">{p.ok ? p.detail : p.error}</span>
            </li>
          ))}
        </ul>
      )}
      <button className="btn mt-3" onClick={onCheck} disabled={!configured || check.state === "running"}>
        {check.state === "running" ? "Checking…" : "Run live check"}
      </button>
    </div>
  );
}
