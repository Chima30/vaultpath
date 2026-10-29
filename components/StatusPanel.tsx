"use client";
import { useState } from "react";
import { api } from "@/lib/client-api";
import { Badge } from "./ui";

type Check = { state: "idle" | "running" | "ok" | "fail"; detail?: string };

export function StatusPanel({ configured }: { configured: { tatum: boolean; memwal: boolean } }) {
  const [tatum, setTatum] = useState<Check>({ state: "idle" });
  const [mem, setMem] = useState<Check>({ state: "idle" });

  async function checkTatum() {
    setTatum({ state: "running" });
    const r = await api<{ chainId: string; latestCheckpoint: string; matchesMainnet: boolean }>("/api/tatum/status", "GET");
    if (!r.ok) return setTatum({ state: "fail", detail: r.error });
    setTatum({
      state: r.data.matchesMainnet ? "ok" : "fail",
      detail: `chain ${r.data.chainId}, latest checkpoint ${r.data.latestCheckpoint}${r.data.matchesMainnet ? "" : " (does not match the expected Sui Mainnet chain id)"}`,
    });
  }

  async function checkMem() {
    setMem({ state: "running" });
    const r = await api<{ health: { status: string }; memoryCount: number; namespace: string }>("/api/memory/status", "GET");
    if (!r.ok) return setMem({ state: "fail", detail: r.error });
    setMem({ state: "ok", detail: `relayer ${r.data.health.status}; ${r.data.memoryCount} memories in namespace "${r.data.namespace}"` });
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Row name="Tatum Sui Mainnet RPC" configured={configured.tatum} check={tatum} onCheck={checkTatum} />
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
          : check.state === "fail" ? <Badge tone="bad">check failed</Badge>
          : <Badge>configured, unverified</Badge>}
      </div>
      {check.detail && <p className={`mt-2 break-words text-xs ${check.state === "fail" ? "text-danger" : "text-muted"}`}>{check.detail}</p>}
      <button className="btn mt-3" onClick={onCheck} disabled={!configured || check.state === "running"}>
        {check.state === "running" ? "Checking…" : "Run live check"}
      </button>
    </div>
  );
}
