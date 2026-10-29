"use client";
import { useState } from "react";
import { api } from "@/lib/client-api";
import { Badge } from "./ui";

type Probe = {
  name: string; ok: boolean; kind: string; ms: number; attempts: number;
  detail?: string; error?: string; httpStatus?: number | null; retryAfterMs?: number | null; rateLimitHeaders?: Record<string, string>;
};
type TatumData = {
  overall: "ok" | "degraded" | "failed"; summary: string; endpoint: string; chain: string | null; networkVerified: boolean;
  latestCheckpoint: string | null; balances: "ok" | "rate_limited" | "failed"; rateLimited: boolean; probes: Probe[];
};
type Check = { state: "idle" | "running" | "ok" | "warn" | "fail"; detail?: string; probes?: Probe[]; balances?: TatumData["balances"] };

export function StatusPanel({ configured }: { configured: { tatum: boolean; memwal: boolean } }) {
  const [tatum, setTatum] = useState<Check>({ state: "idle" });
  const [mem, setMem] = useState<Check>({ state: "idle" });

  async function checkTatum() {
    setTatum({ state: "running" });
    const r = await api<TatumData>("/api/tatum/status", "GET");
    const d = (r.ok ? r.data : (r.data as TatumData | undefined)) ?? undefined;
    if (!r.ok) return setTatum({ state: "fail", detail: r.error, probes: d?.probes, balances: d?.balances });
    const base = `${d!.endpoint} · chain ${d!.chain ?? "unknown"} · latest checkpoint ${d!.latestCheckpoint ?? "?"}`;
    if (d!.overall === "ok") return setTatum({ state: "ok", detail: base, probes: d!.probes, balances: d!.balances });
    setTatum({ state: "warn", detail: `Not fully verified: ${d!.summary}`, probes: d!.probes, balances: d!.balances });
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

function probeLabel(p: Probe): { mark: string; cls: string; text: string } {
  if (p.ok) return { mark: "✓", cls: "text-muted", text: p.detail ?? "ok" };
  if (p.kind === "rate_limited") {
    const ra = p.retryAfterMs != null ? `, Retry-After ${Math.ceil(p.retryAfterMs / 1000)}s` : "";
    return { mark: "⏳", cls: "text-brass", text: `Rate limited by Tatum (HTTP ${p.httpStatus ?? 429}${ra}) after ${p.attempts} attempt${p.attempts === 1 ? "" : "s"}. No result was returned.` };
  }
  return { mark: "✗", cls: "text-danger", text: p.error ?? "failed" };
}

function Row({ name, configured, check, onCheck }: { name: string; configured: boolean; check: Check; onCheck: () => void }) {
  return (
    <div className="rounded-md border border-line bg-raised p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-text">{name}</p>
        {!configured ? <Badge tone="warn">not configured</Badge>
          : check.state === "ok" ? <Badge tone="ok">verified just now</Badge>
          : check.state === "warn" ? <Badge tone="warn">partly verified</Badge>
          : check.state === "fail" ? <Badge tone="bad">check failed</Badge>
          : <Badge>configured, unverified</Badge>}
      </div>
      {check.balances && (
        <p className="mt-2 text-xs">
          <span className="text-muted">Balances: </span>
          {check.balances === "ok" ? <span className="text-ok">verified</span>
            : check.balances === "rate_limited" ? <span className="text-brass">not verified, rate limited by Tatum</span>
            : <span className="text-danger">not verified, request failed</span>}
        </p>
      )}
      {check.detail && <p className={`mt-2 break-words text-xs ${check.state === "fail" ? "text-danger" : check.state === "warn" ? "text-brass" : "text-muted"}`}>{check.detail}</p>}
      {check.probes && (
        <ul className="mt-2 space-y-1 text-xs">
          {check.probes.map((p) => {
            const l = probeLabel(p);
            return (
              <li key={p.name} className={l.cls}>
                <span className="font-mono">{l.mark} {p.name}</span>
                <span className="block break-words pl-4">{l.text}</span>
              </li>
            );
          })}
        </ul>
      )}
      <button className="btn mt-3" onClick={onCheck} disabled={!configured || check.state === "running"}>
        {check.state === "running" ? "Checking…" : "Run live check"}
      </button>
    </div>
  );
}
