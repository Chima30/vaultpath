import "server-only";
import { config } from "./config";
import { NotConfiguredError, UpstreamError } from "./errors";
import type { TxSummary } from "./types";

// Sui Mainnet JSON-RPC through the Tatum RPC gateway.
// Endpoint: https://sui-mainnet.gateway.tatum.io  (auth header: x-api-key)
// Source: https://tatum.io/chain/sui  and  https://docs.tatum.io/
// NOTE: Mysten Labs is retiring Sui JSON-RPC in favour of gRPC/GraphQL. Tatum still
// lists JSON-RPC for Sui Mainnet; if Tatum retires it, this file is the single
// place to migrate (Tatum also offers sui-mainnet-grpc.gateway.tatum.io:443).

export function normalizeAddress(input: string): string | null {
  const m = /^0x([0-9a-fA-F]{1,64})$/.exec(input.trim());
  return m ? "0x" + m[1].toLowerCase().padStart(64, "0") : null;
}

export async function suiRpc<T>(method: string, params: unknown[]): Promise<T> {
  const { apiKey, rpcUrl } = config.tatum;
  if (!apiKey) throw new NotConfiguredError("Tatum", ["TATUM_API_KEY"]);

  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json", "x-api-key": apiKey },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });

  const text = await res.text();
  let json: { result?: T; error?: { code?: number; message?: string } };
  try {
    json = JSON.parse(text);
  } catch {
    throw new UpstreamError("tatum", `${method}: HTTP ${res.status}, response was not JSON`);
  }
  if (!res.ok) throw new UpstreamError("tatum", `${method}: HTTP ${res.status} ${json.error?.message ?? ""}`.trim());
  if (json.error) throw new UpstreamError("tatum", `${method}: ${json.error.message ?? "RPC error"}`);
  if (json.result === undefined) throw new UpstreamError("tatum", `${method}: empty result`);
  return json.result;
}

// Sui mainnet chain identifier (first 4 bytes of the genesis checkpoint digest).
const MAINNET_CHAIN_ID = "35834a8a";

export async function tatumStatus() {
  const [chainId, checkpoint] = await Promise.all([
    suiRpc<string>("sui_getChainIdentifier", []),
    suiRpc<string>("sui_getLatestCheckpointSequenceNumber", []),
  ]);
  return { chainId, latestCheckpoint: checkpoint, matchesMainnet: chainId === MAINNET_CHAIN_ID, rpcUrl: config.tatum.rpcUrl };
}

type RawBalance = { coinType: string; coinObjectCount: number; totalBalance: string };
type RawChange = { owner?: { AddressOwner?: string } | string; coinType: string; amount: string };
type RawTx = {
  digest: string;
  timestampMs?: string;
  transaction?: { data?: { sender?: string } };
  balanceChanges?: RawChange[];
};
type RawTxPage = { data: RawTx[]; nextCursor?: string | null; hasNextPage: boolean };

function ownerOf(c: RawChange): string | null {
  if (!c.owner) return null;
  if (typeof c.owner === "string") return c.owner;
  return c.owner.AddressOwner ?? null;
}

export async function fetchSubjectEvidence(address: string, limit = 25) {
  const [checkpoint, balances, page] = await Promise.all([
    suiRpc<string>("sui_getLatestCheckpointSequenceNumber", []),
    suiRpc<RawBalance[]>("suix_getAllBalances", [address]),
    suiRpc<RawTxPage>("suix_queryTransactionBlocks", [
      { filter: { FromOrToAddress: { addr: address } }, options: { showInput: true, showBalanceChanges: true } },
      null,
      limit,
      true,
    ]),
  ]);

  const transactions: TxSummary[] = page.data.map((t) => ({
    digest: t.digest,
    timestampMs: t.timestampMs ?? null,
    sender: t.transaction?.data?.sender ?? null,
    balanceChanges: (t.balanceChanges ?? []).map((c) => ({ owner: ownerOf(c), coinType: c.coinType, amount: c.amount })),
  }));

  const counts = new Map<string, number>();
  for (const t of transactions) {
    const seen = new Set<string>();
    if (t.sender) seen.add(t.sender);
    for (const c of t.balanceChanges) if (c.owner) seen.add(c.owner);
    seen.delete(address);
    for (const a of seen) counts.set(a, (counts.get(a) ?? 0) + 1);
  }
  const counterparties = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([addr, interactions]) => ({ address: addr, interactions }));

  return {
    checkpoint,
    balances,
    transactions,
    counterparties,
    hasMoreTransactions: page.hasNextPage,
  };
}
