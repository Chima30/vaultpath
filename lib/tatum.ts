import "server-only";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import descriptor from "./sui-grpc-descriptor.json";
import { config } from "./config";
import { NotConfiguredError, UpstreamError } from "./errors";
import type { TxSummary } from "./types";

// Sui Mainnet over gRPC through Tatum.
//   Endpoint : sui-mainnet-grpc.gateway.tatum.io:443 (HTTP/2 + TLS)
//   Auth     : "x-api-key" gRPC metadata, value = TATUM_API_KEY
//   Docs     : https://docs.tatum.io/reference/sui-grpc
// Sui JSON-RPC is deprecated upstream and Tatum documents gRPC as its replacement,
// so no JSON-RPC request is made anywhere in this app.
//
// The protobuf definitions are the official MystenLabs/sui-apis protos
// (sui/rpc/v2/ledger_service.proto and state_service.proto), compiled once into
// lib/sui-grpc-descriptor.json so no .proto files are needed at runtime.

const CALL_TIMEOUT_MS = 20_000;
const MAINNET_GENESIS_DIGEST = "4btiuiMPvEENsttpZC7CZ53DruC3MAgfznDbASZ7DR6S";
const JSON_RPC_HOST = "sui-mainnet.gateway.tatum.io";

export function normalizeAddress(input: string): string | null {
  const m = /^0x([0-9a-fA-F]{1,64})$/.exec(input.trim());
  return m ? "0x" + m[1].toLowerCase().padStart(64, "0") : null;
}

export class TatumGrpcError extends UpstreamError {
  constructor(public grpcCode: number, public method: string, message: string) {
    super("tatum", message);
    this.name = "TatumGrpcError";
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Client = any;
let cached: { ledger: Client; state: Client } | null = null;

function clients() {
  const { apiKey, grpcTarget } = config.tatum;
  if (!apiKey) throw new NotConfiguredError("Tatum", ["TATUM_API_KEY"]);
  if (grpcTarget.startsWith(JSON_RPC_HOST)) {
    throw new UpstreamError(
      "tatum",
      `TATUM_SUI_GRPC_URL points at the JSON-RPC host (${JSON_RPC_HOST}). Use sui-mainnet-grpc.gateway.tatum.io or remove the variable.`,
    );
  }
  if (!cached) {
    const def = protoLoader.fromJSON(descriptor as unknown as Parameters<typeof protoLoader.fromJSON>[0], {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: false,
      arrays: true,
      oneofs: false,
    });
    const v2 = (grpc.loadPackageDefinition(def) as any).sui.rpc.v2;
    const creds = grpc.credentials.createSsl();
    cached = {
      ledger: new v2.LedgerService(grpcTarget, creds),
      state: new v2.StateService(grpcTarget, creds),
    };
  }
  return cached;
}

function metadata(): grpc.Metadata {
  const md = new grpc.Metadata();
  md.set("x-api-key", config.tatum.apiKey as string);
  return md;
}

function mapError(method: string, err: grpc.ServiceError): TatumGrpcError {
  const target = config.tatum.grpcTarget;
  const raw = String(err.details || err.message || "").replace(config.tatum.apiKey ?? "\u0000", "[redacted]").slice(0, 300);
  const S = grpc.status;
  let msg: string;
  switch (err.code) {
    case S.UNAUTHENTICATED:
      msg = `${method}: Tatum rejected the API key (UNAUTHENTICATED). Check TATUM_API_KEY. ${raw}`;
      break;
    case S.PERMISSION_DENIED:
      msg = `${method}: this API key is not permitted to use Sui Mainnet gRPC (PERMISSION_DENIED). ${raw}`;
      break;
    case S.UNIMPLEMENTED:
      msg = `${method}: not supported by this Tatum Sui node (UNIMPLEMENTED).`;
      break;
    case S.UNAVAILABLE:
      msg = `${method}: could not reach ${target} (UNAVAILABLE). ${raw}`;
      break;
    case S.DEADLINE_EXCEEDED:
      msg = `${method}: timed out after ${CALL_TIMEOUT_MS / 1000}s (DEADLINE_EXCEEDED).`;
      break;
    case S.RESOURCE_EXHAUSTED:
      msg = `${method}: Tatum rate or credit limit reached (RESOURCE_EXHAUSTED). ${raw}`;
      break;
    case S.NOT_FOUND:
      msg = `${method}: not found, or pruned by the node (NOT_FOUND). ${raw}`;
      break;
    case S.INVALID_ARGUMENT:
      msg = `${method}: the node rejected the request (INVALID_ARGUMENT). ${raw}`;
      break;
    default:
      msg = `${method}: gRPC error ${err.code} ${grpc.status[err.code] ?? ""}. ${raw}`;
  }
  return new TatumGrpcError(err.code, method, msg.trim());
}

function unary<T>(client: Client, service: string, method: string, request: object): Promise<T> {
  return new Promise((resolve, reject) => {
    client[method](request, metadata(), { deadline: Date.now() + CALL_TIMEOUT_MS }, (err: grpc.ServiceError | null, res: T) =>
      err ? reject(mapError(`${service}/${method}`, err)) : resolve(res),
    );
  });
}

function collect<T>(client: Client, service: string, method: string, request: object): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const frames: T[] = [];
    const call = client[method](request, metadata(), { deadline: Date.now() + CALL_TIMEOUT_MS });
    call.on("data", (f: T) => frames.push(f));
    call.on("error", (err: grpc.ServiceError) => reject(mapError(`${service}/${method}`, err)));
    call.on("end", () => resolve(frames));
  });
}

/* ------------------------------------------------------------------ typed calls */

type ServiceInfo = { chain_id?: string; chain?: string; epoch?: string; checkpoint_height?: string; server?: string };
type Checkpoint = { checkpoint?: { sequence_number?: string; digest?: string } };
type Balance = { coin_type?: string; balance?: string; address_balance?: string; coin_balance?: string };
type BalancesPage = { balances: Balance[]; next_page_token?: Buffer };
type Ts = { seconds?: string; nanos?: number };
type ListTxFrame = {
  transaction?: {
    digest?: string;
    checkpoint?: string;
    timestamp?: Ts;
    transaction?: { sender?: string };
    balance_changes?: { address?: string; coin_type?: string; amount?: string }[];
  };
  end?: { reason?: string };
};

const getServiceInfo = () => unary<ServiceInfo>(clients().ledger, "LedgerService", "GetServiceInfo", {});
const getLatestCheckpoint = () =>
  unary<Checkpoint>(clients().ledger, "LedgerService", "GetCheckpoint", { read_mask: { paths: ["sequence_number", "digest"] } });
const listBalancesPage = (owner: string, token?: Buffer) =>
  unary<BalancesPage>(clients().state, "StateService", "ListBalances", { owner, page_size: 200, ...(token ? { page_token: token } : {}) });
const listTransactions = (request: object) =>
  collect<ListTxFrame>(clients().ledger, "LedgerService", "ListTransactions", request);

function isMainnet(info: ServiceInfo): boolean | null {
  if (info.chain) return info.chain.toLowerCase() === "mainnet";
  if (info.chain_id) return info.chain_id === MAINNET_GENESIS_DIGEST || info.chain_id === "35834a8a";
  return null;
}

/* ------------------------------------------------------------------ live check */

export type Probe = { name: string; ok: boolean; ms: number; detail?: string; error?: string };

async function probe(name: string, fn: () => Promise<string>): Promise<Probe> {
  const t0 = Date.now();
  try {
    return { name, ok: true, ms: Date.now() - t0, detail: await fn() };
  } catch (e) {
    return { name, ok: false, ms: Date.now() - t0, error: e instanceof Error ? e.message : String(e) };
  }
}

export type TatumStatus = {
  overall: "ok" | "degraded" | "failed";
  endpoint: string;
  protocol: "grpc";
  chain: string | null;
  networkVerified: boolean;
  latestCheckpoint: string | null;
  probes: Probe[];
};

// Real calls only. "ok" requires every probe to succeed and the node to identify as mainnet.
export async function tatumStatus(): Promise<TatumStatus> {
  clients(); // throws NotConfigured / misconfiguration before any network use

  let info: ServiceInfo | null = null;
  let latest: string | null = null;

  const probes = await Promise.all([
    probe("LedgerService/GetServiceInfo", async () => {
      info = await getServiceInfo();
      return `chain=${info.chain ?? "?"} chain_id=${info.chain_id ?? "?"} epoch=${info.epoch ?? "?"}`;
    }),
    probe("LedgerService/GetCheckpoint (latest)", async () => {
      const r = await getLatestCheckpoint();
      latest = r.checkpoint?.sequence_number ?? null;
      if (!latest) throw new UpstreamError("tatum", "GetCheckpoint returned no sequence_number");
      return `latest checkpoint ${latest}`;
    }),
    probe("StateService/ListBalances", async () => {
      const r = await unary<BalancesPage>(clients().state, "StateService", "ListBalances", {
        owner: "0x" + "0".repeat(64),
        page_size: 1,
      });
      return `answered (${r.balances.length} balance entries for the zero address)`;
    }),
    probe("LedgerService/ListTransactions", async () => {
      const frames = await listTransactions({
        read_mask: { paths: ["digest", "checkpoint"] },
        options: { limit: 1, ordering: "ORDERING_DESCENDING" },
      });
      const tx = frames.find((f) => f.transaction)?.transaction;
      if (!tx?.digest) throw new UpstreamError("tatum", "ListTransactions returned no transaction");
      return `latest transaction ${tx.digest.slice(0, 12)}… at checkpoint ${tx.checkpoint ?? "?"}`;
    }),
  ]);

  const mainnet = info ? isMainnet(info) : null;
  const checkpointOk = probes[1].ok;
  const allOk = probes.every((p) => p.ok);
  const overall: TatumStatus["overall"] = !checkpointOk || mainnet === false ? "failed" : allOk && mainnet === true ? "ok" : "degraded";

  return {
    overall,
    endpoint: config.tatum.grpcTarget,
    protocol: "grpc",
    chain: (info as ServiceInfo | null)?.chain ?? null,
    networkVerified: mainnet === true,
    latestCheckpoint: latest,
    probes,
  };
}

/* ------------------------------------------------------------------ evidence */

function tsToMs(t?: Ts): string | null {
  if (!t?.seconds) return null;
  return String(Number(t.seconds) * 1000 + Math.floor((t.nanos ?? 0) / 1_000_000));
}

export async function fetchSubjectEvidence(address: string, limit = 25) {
  // 1. Confirm we are talking to Sui Mainnet (refuse to store anything otherwise).
  let networkVerified = false;
  let chain: string | null = null;
  try {
    const info = await getServiceInfo();
    chain = info.chain ?? null;
    const m = isMainnet(info);
    if (m === false) throw new UpstreamError("tatum", `Endpoint reports chain "${info.chain ?? info.chain_id}", not Sui Mainnet. Nothing was stored.`);
    networkVerified = m === true;
  } catch (e) {
    // Only "GetServiceInfo is not implemented on this node" is tolerated; every other
    // failure (auth, network, wrong chain) aborts the fetch.
    const unimplemented = e instanceof TatumGrpcError && e.grpcCode === grpc.status.UNIMPLEMENTED;
    if (!unimplemented) throw e;
  }

  // 2. Latest checkpoint and balances (required: failures abort the whole fetch).
  const checkpoint = (await getLatestCheckpoint()).checkpoint?.sequence_number ?? null;
  const balances: { coinType: string; totalBalance: string; addressBalance?: string; coinBalance?: string }[] = [];
  let token: Buffer | undefined;
  for (let page = 0; page < 5; page++) {
    const r = await listBalancesPage(address, token);
    for (const b of r.balances) {
      balances.push({ coinType: b.coin_type ?? "", totalBalance: b.balance ?? "0", addressBalance: b.address_balance, coinBalance: b.coin_balance });
    }
    if (!r.next_page_token || r.next_page_token.length === 0) break;
    token = r.next_page_token;
  }

  // 3. Transaction history. A failure here is reported, never papered over.
  let transactions: TxSummary[] = [];
  let hasMoreTransactions = false;
  let transactionsError: string | null = null;
  try {
    const frames = await listTransactions({
      read_mask: { paths: ["digest", "checkpoint", "timestamp", "transaction.sender", "balance_changes"] },
      filter: {
        terms: [
          { literals: [{ sender: { address } }] },
          { literals: [{ affected_address: { address } }] },
        ],
      },
      options: { limit, ordering: "ORDERING_DESCENDING" },
    });
    const seen = new Set<string>();
    for (const f of frames) {
      const t = f.transaction;
      if (!t?.digest || seen.has(t.digest)) continue;
      seen.add(t.digest);
      transactions.push({
        digest: t.digest,
        timestampMs: tsToMs(t.timestamp),
        sender: t.transaction?.sender ?? null,
        balanceChanges: (t.balance_changes ?? []).map((c) => ({ owner: c.address ?? null, coinType: c.coin_type ?? "", amount: c.amount ?? "0" })),
      });
    }
    hasMoreTransactions = frames.some((f) => f.end?.reason === "QUERY_END_REASON_ITEM_LIMIT");
  } catch (e) {
    transactionsError = e instanceof Error ? e.message : String(e);
    transactions = [];
  }

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

  return { checkpoint, chain, networkVerified, balances, transactions, counterparties, hasMoreTransactions, transactionsError };
}
