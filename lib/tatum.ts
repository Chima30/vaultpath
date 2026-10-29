import "server-only";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import descriptor from "./sui-grpc-descriptor.json";
import { config } from "./config";
import { NotConfiguredError, TatumGrpcError, UpstreamError, type TatumErrorKind } from "./errors";

export { TatumGrpcError };
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

// ---------------------------------------------------------------- error classification
// gRPC maps HTTP 429/502/503/504 from a gateway to UNAVAILABLE (per the gRPC HTTP/2
// spec), 401 to UNAUTHENTICATED and 403 to PERMISSION_DENIED. A malformed request is
// answered by the node itself with INVALID_ARGUMENT, never with an HTTP 429.

const HEADER_WHITELIST = /^(retry-after|x-?rate-?limit.*|ratelimit.*|x-ratelimit.*)$/i;

function headerMap(err: grpc.ServiceError, captured?: grpc.Metadata): Record<string, string> {
  const out: Record<string, string> = {};
  // grpc-js does not attach the HTTP response headers of a gateway error (such as a 429) to the
  // error itself; they are only visible to a call interceptor, hence the `captured` metadata.
  for (const md of [err.metadata, captured]) {
    try {
      for (const [k, v] of Object.entries(md?.getMap?.() ?? {})) if (HEADER_WHITELIST.test(k)) out[k.toLowerCase()] = String(v);
    } catch {
      /* diagnostics only */
    }
  }
  return out;
}

function parseRetryAfter(headers: Record<string, string>): number | null {
  const v = headers["retry-after"];
  if (!v) return null;
  if (/^\d+(\.\d+)?$/.test(v.trim())) return Math.round(Number(v) * 1000);
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : Math.max(0, t - Date.now());
}

function parseHttpStatus(text: string): number | null {
  const m = /(?:HTTP status code|status code|HTTP)\s*[:=]?\s*(\d{3})/i.exec(text);
  return m ? Number(m[1]) : null;
}

function classify(err: grpc.ServiceError, httpStatus: number | null): TatumErrorKind {
  const S = grpc.status;
  if (err.code === S.RESOURCE_EXHAUSTED || httpStatus === 429) return "rate_limited";
  switch (err.code) {
    case S.UNAVAILABLE:
      return "unavailable";
    case S.UNAUTHENTICATED:
    case S.PERMISSION_DENIED:
      return "auth";
    case S.INVALID_ARGUMENT:
    case S.FAILED_PRECONDITION:
    case S.OUT_OF_RANGE:
      return "invalid_request";
    case S.UNIMPLEMENTED:
      return "unsupported";
    case S.NOT_FOUND:
      return "not_found";
    case S.DEADLINE_EXCEEDED:
      return "timeout";
    default:
      return "other";
  }
}

function mapError(method: string, err: grpc.ServiceError, captured?: grpc.Metadata): TatumGrpcError {
  const target = config.tatum.grpcTarget;
  const key = config.tatum.apiKey ?? "\u0000";
  const raw = String(err.details || err.message || "").split(key).join("[redacted]").slice(0, 300);
  const httpStatus = parseHttpStatus(raw);
  const headers = headerMap(err, captured);
  const retryAfterMs = parseRetryAfter(headers);
  const kind = classify(err, httpStatus);
  const codeName = grpc.status[err.code] ?? String(err.code);

  let msg: string;
  switch (kind) {
    case "rate_limited": {
      const ra = retryAfterMs != null ? `, Retry-After ${Math.ceil(retryAfterMs / 1000)}s` : "";
      msg = `${method}: rate limited by Tatum (${httpStatus ? `HTTP ${httpStatus}` : codeName}${ra}). Tatum documents HTTP 429 as the per-second request limit being reached.`;
      break;
    }
    case "auth":
      msg = `${method}: Tatum rejected the API key or its permissions (${codeName}). Check TATUM_API_KEY and that it has Sui Mainnet access. ${raw}`;
      break;
    case "invalid_request":
      msg = `${method}: the node rejected the request as invalid (${codeName}). ${raw}`;
      break;
    case "unsupported":
      msg = `${method}: not supported by this Tatum Sui node (UNIMPLEMENTED).`;
      break;
    case "not_found":
      msg = `${method}: not found, or pruned by the node (NOT_FOUND). ${raw}`;
      break;
    case "timeout":
      msg = `${method}: timed out after ${CALL_TIMEOUT_MS / 1000}s (DEADLINE_EXCEEDED).`;
      break;
    case "unavailable":
      msg = `${method}: could not complete the request to ${target} (UNAVAILABLE${httpStatus ? `, HTTP ${httpStatus}` : ""}). ${raw}`;
      break;
    default:
      msg = `${method}: gRPC error ${err.code} ${codeName}. ${raw}`;
  }
  return new TatumGrpcError(err.code, method, kind, httpStatus, retryAfterMs, headers, msg.trim());
}

type HeaderHolder = { md?: grpc.Metadata };

function captureHeaders(holder: HeaderHolder): grpc.Interceptor {
  return (options, nextCall) =>
    new grpc.InterceptingCall(nextCall(options), {
      start(md, listener, next) {
        next(md, {
          onReceiveMetadata(received, nxt) {
            holder.md = received;
            nxt(received);
          },
        });
      },
    });
}

function rawUnary<T>(client: Client, service: string, method: string, request: object): Promise<T> {
  return new Promise((resolve, reject) => {
    const holder: HeaderHolder = {};
    client[method](
      request,
      metadata(),
      { deadline: Date.now() + CALL_TIMEOUT_MS, interceptors: [captureHeaders(holder)] },
      (err: grpc.ServiceError | null, res: T) => (err ? reject(mapError(`${service}/${method}`, err, holder.md)) : resolve(res)),
    );
  });
}

function rawCollect<T>(client: Client, service: string, method: string, request: object): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const holder: HeaderHolder = {};
    const frames: T[] = [];
    const call = client[method](request, metadata(), { deadline: Date.now() + CALL_TIMEOUT_MS, interceptors: [captureHeaders(holder)] });
    call.on("data", (f: T) => frames.push(f));
    call.on("error", (err: grpc.ServiceError) => reject(mapError(`${service}/${method}`, err, holder.md)));
    call.on("end", () => resolve(frames));
  });
}

// ---------------------------------------------------------------- pacing + bounded retry
// Tatum's Free plan is documented at 3 requests/second (docs.tatum.io/docs/plans-limits).
// Every call is spaced >= MIN_GAP_MS apart (~2.5/s) so a normal run stays under that.
// The spacing is per server instance: separate Vercel instances do not coordinate.
const MIN_GAP_MS = 400;
const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 4_000;
const MAX_RETRY_AFTER_MS = 8_000; // never sleep longer than this because the provider said so
const RETRY_BUDGET_MS = 15_000; // total time one call may spend retrying
const MAX_RETRIES: Partial<Record<TatumErrorKind, number>> = { rate_limited: 3, unavailable: 2 };

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
let nextSlot = 0;

async function pace() {
  const now = Date.now();
  const at = Math.max(now, nextSlot);
  nextSlot = at + MIN_GAP_MS;
  if (at > now) await sleep(at - now);
}

type Stats = { attempts: number };

// Only rate limits (429 / RESOURCE_EXHAUSTED) and transient UNAVAILABLE are retried.
// Authentication, invalid-argument, unsupported, not-found and timeout errors are
// permanent for this purpose and are thrown on the first attempt.
async function withRetry<T>(fn: () => Promise<T>, stats?: Stats): Promise<T> {
  const started = Date.now();
  for (let attempt = 1; ; attempt++) {
    if (stats) stats.attempts = attempt;
    await pace();
    try {
      return await fn();
    } catch (e) {
      if (!(e instanceof TatumGrpcError)) throw e;
      e.attempts = attempt;
      const retriesDone = attempt - 1;
      const allowed = MAX_RETRIES[e.kind] ?? 0;
      const giveUp = (why?: string) => {
        if (attempt > 1 || why) e.message += ` Gave up after ${attempt} attempt${attempt === 1 ? "" : "s"}${why ? `: ${why}` : ""}.`;
        return e;
      };
      if (retriesDone >= allowed) throw giveUp();

      let delay: number;
      if (e.retryAfterMs != null) {
        if (e.retryAfterMs > MAX_RETRY_AFTER_MS) {
          throw giveUp(`Tatum asked to wait ${Math.ceil(e.retryAfterMs / 1000)}s, longer than the ${MAX_RETRY_AFTER_MS / 1000}s this app will wait`);
        }
        delay = e.retryAfterMs + Math.floor(Math.random() * 250);
      } else {
        delay = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** retriesDone) * (0.8 + Math.random() * 0.4);
      }
      if (Date.now() - started + delay > RETRY_BUDGET_MS) throw giveUp("retry time budget used up");
      await sleep(delay);
    }
  }
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

// ListBalancesRequest fields (sui/rpc/v2/state_service.proto): owner = 1, page_size = 2, page_token = 3.
const getServiceInfo = (st?: Stats) =>
  withRetry(() => rawUnary<ServiceInfo>(clients().ledger, "LedgerService", "GetServiceInfo", {}), st);
const getLatestCheckpoint = (st?: Stats) =>
  withRetry(
    () => rawUnary<Checkpoint>(clients().ledger, "LedgerService", "GetCheckpoint", { read_mask: { paths: ["sequence_number", "digest"] } }),
    st,
  );
const listBalancesPage = (owner: string, pageSize: number, token?: Buffer, st?: Stats) =>
  withRetry(
    () =>
      rawUnary<BalancesPage>(clients().state, "StateService", "ListBalances", {
        owner,
        page_size: pageSize,
        ...(token ? { page_token: token } : {}),
      }),
    st,
  );
const listTransactions = (request: object, st?: Stats) =>
  withRetry(() => rawCollect<ListTxFrame>(clients().ledger, "LedgerService", "ListTransactions", request), st);

function isMainnet(info: ServiceInfo): boolean | null {
  if (info.chain) return info.chain.toLowerCase() === "mainnet";
  if (info.chain_id) return info.chain_id === MAINNET_GENESIS_DIGEST || info.chain_id === "35834a8a";
  return null;
}

/* ------------------------------------------------------------------ live check */

export type Probe = {
  name: string;
  ok: boolean;
  kind: "ok" | TatumErrorKind;
  ms: number;
  attempts: number;
  detail?: string;
  error?: string;
  httpStatus?: number | null;
  retryAfterMs?: number | null;
  rateLimitHeaders?: Record<string, string>;
};

async function probe(name: string, fn: (st: Stats) => Promise<string>): Promise<Probe> {
  const t0 = Date.now();
  const st: Stats = { attempts: 0 };
  try {
    const detail = await fn(st);
    return { name, ok: true, kind: "ok", ms: Date.now() - t0, attempts: st.attempts, detail };
  } catch (e) {
    if (e instanceof TatumGrpcError) {
      return {
        name, ok: false, kind: e.kind, ms: Date.now() - t0, attempts: e.attempts || st.attempts, error: e.message,
        httpStatus: e.httpStatus, retryAfterMs: e.retryAfterMs, rateLimitHeaders: e.headers,
      };
    }
    return { name, ok: false, kind: "other", ms: Date.now() - t0, attempts: st.attempts, error: e instanceof Error ? e.message : String(e) };
  }
}

export type TatumStatus = {
  overall: "ok" | "degraded" | "failed";
  summary: string;
  endpoint: string;
  protocol: "grpc";
  chain: string | null;
  networkVerified: boolean;
  latestCheckpoint: string | null;
  balances: "ok" | "rate_limited" | "failed";
  rateLimited: boolean;
  probes: Probe[];
};

// Real calls only, run one after another (never in a burst). "ok" requires every probe to
// succeed AND the node to identify as mainnet. A rate-limited ListBalances can never yield "ok".
export async function tatumStatus(): Promise<TatumStatus> {
  clients(); // throws NotConfigured / misconfiguration before any network use

  let info: ServiceInfo | null = null;
  let latest: string | null = null;
  const probes: Probe[] = [];

  probes.push(
    await probe("LedgerService/GetServiceInfo", async (st) => {
      info = await getServiceInfo(st);
      return `chain=${info.chain ?? "?"} chain_id=${info.chain_id ?? "?"} epoch=${info.epoch ?? "?"}`;
    }),
  );
  probes.push(
    await probe("LedgerService/GetCheckpoint (latest)", async (st) => {
      const r = await getLatestCheckpoint(st);
      latest = r.checkpoint?.sequence_number ?? null;
      if (!latest) throw new UpstreamError("tatum", "GetCheckpoint returned no sequence_number");
      return `latest checkpoint ${latest}`;
    }),
  );
  probes.push(
    await probe("StateService/ListBalances", async (st) => {
      const r = await listBalancesPage("0x" + "0".repeat(64), 1, undefined, st);
      return `answered (${r.balances.length} balance entries for the zero address)`;
    }),
  );
  probes.push(
    await probe("LedgerService/ListTransactions", async (st) => {
      const frames = await listTransactions(
        { read_mask: { paths: ["digest", "checkpoint"] }, options: { limit: 1, ordering: "ORDERING_DESCENDING" } },
        st,
      );
      const tx = frames.find((f) => f.transaction)?.transaction;
      if (!tx?.digest) throw new UpstreamError("tatum", "ListTransactions returned no transaction");
      return `latest transaction ${tx.digest.slice(0, 12)}… at checkpoint ${tx.checkpoint ?? "?"}`;
    }),
  );

  const mainnet = info ? isMainnet(info) : null;
  const [pInfo, pCheckpoint, pBalances, pTx] = probes;
  const limited = probes.filter((p) => p.kind === "rate_limited");
  const hardFailed = probes.filter((p) => !p.ok && p.kind !== "rate_limited");
  const checkpointOk = pCheckpoint.ok;

  let overall: TatumStatus["overall"];
  if (mainnet === false || probes.every((p) => !p.ok) || (!checkpointOk && pCheckpoint.kind !== "rate_limited")) overall = "failed";
  else if (probes.every((p) => p.ok) && mainnet === true) overall = "ok";
  else overall = "degraded";

  const problems: string[] = [];
  if (mainnet === false) problems.push("the node does not report Sui Mainnet");
  if (!pInfo.ok && mainnet === null) problems.push("the network could not be confirmed as mainnet");
  if (pBalances.kind === "rate_limited") problems.push(`ListBalances was rate limited by Tatum after ${pBalances.attempts} attempt${pBalances.attempts === 1 ? "" : "s"}; balances are NOT verified`);
  for (const p of [pInfo, pCheckpoint, pTx]) if (!p.ok) problems.push(`${p.name}: ${p.kind === "rate_limited" ? "rate limited" : "failed"}`);
  if (pBalances.kind !== "rate_limited" && !pBalances.ok) problems.push("ListBalances failed");
  void hardFailed;

  return {
    overall,
    summary: overall === "ok" ? "All four Tatum Sui Mainnet calls succeeded." : problems.join("; ") || "Not verified.",
    endpoint: config.tatum.grpcTarget,
    protocol: "grpc",
    chain: (info as ServiceInfo | null)?.chain ?? null,
    networkVerified: mainnet === true,
    latestCheckpoint: latest,
    balances: pBalances.ok ? "ok" : pBalances.kind === "rate_limited" ? "rate_limited" : "failed",
    rateLimited: limited.length > 0,
    probes,
  };
}

/* ------------------------------------------------------------------ evidence */

function tsToMs(t?: Ts): string | null {
  if (!t?.seconds) return null;
  return String(Number(t.seconds) * 1000 + Math.floor((t.nanos ?? 0) / 1_000_000));
}

export type Failure = {
  message: string;
  kind: TatumErrorKind;
  httpStatus: number | null;
  attempts: number;
  retryAfterMs: number | null;
};

function toFailure(e: unknown): Failure {
  if (e instanceof TatumGrpcError) {
    return { message: e.message, kind: e.kind, httpStatus: e.httpStatus, attempts: e.attempts, retryAfterMs: e.retryAfterMs };
  }
  return { message: e instanceof Error ? e.message : String(e), kind: "other", httpStatus: null, attempts: 1, retryAfterMs: null };
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
    // failure (auth, rate limit, network, wrong chain) aborts the fetch.
    const unimplemented = e instanceof TatumGrpcError && e.kind === "unsupported";
    if (!unimplemented) throw e;
  }

  // 2. Latest checkpoint (required).
  const checkpoint = (await getLatestCheckpoint()).checkpoint?.sequence_number ?? null;

  // 3. Balances. Failure is recorded and reported; balances are never guessed or defaulted.
  let balances: { coinType: string; totalBalance: string; addressBalance?: string; coinBalance?: string }[] | null = [];
  let balancesError: Failure | null = null;
  try {
    let token: Buffer | undefined;
    for (let page = 0; page < 5; page++) {
      const r = await listBalancesPage(address, 200, token);
      for (const b of r.balances) {
        balances.push({ coinType: b.coin_type ?? "", totalBalance: b.balance ?? "0", addressBalance: b.address_balance, coinBalance: b.coin_balance });
      }
      if (!r.next_page_token || r.next_page_token.length === 0) break;
      token = r.next_page_token;
    }
  } catch (e) {
    balances = null;
    balancesError = toFailure(e);
  }

  // 4. Transaction history. A failure here is reported, never papered over.
  let transactions: TxSummary[] = [];
  let hasMoreTransactions = false;
  let transactionsError: Failure | null = null;
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
    transactionsError = toFailure(e);
    transactions = [];
  }

  if (balancesError && transactionsError) {
    // Nothing real was retrieved: fail the whole fetch with the first error.
    throw new UpstreamError("tatum", `Balances: ${balancesError.message} Transactions: ${transactionsError.message}`);
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

  return { checkpoint, chain, networkVerified, balances, balancesError, transactions, counterparties, hasMoreTransactions, transactionsError };
}
