import "server-only";
import { createHash } from "node:crypto";
import { MemWal } from "@mysten-incubation/memwal";
import { config } from "./config";
import { NotConfiguredError } from "./errors";

// Walrus Memory TypeScript SDK (@mysten-incubation/memwal, beta).
// Docs: https://docs.wal.app/walrus-memory/sdk/api-reference
// Mainnet relayer: https://relayer.memory.walrus.xyz
// The delegate key stays on the server; it is never sent to the browser.

let client: MemWal | null = null;

export function getMemwal(): MemWal {
  const { accountId, delegateKey, relayerUrl, namespace } = config.memwal;
  if (!accountId || !delegateKey) {
    const missing = [!accountId && "MEMWAL_ACCOUNT_ID", !delegateKey && "MEMWAL_DELEGATE_KEY"].filter(Boolean) as string[];
    throw new NotConfiguredError("Walrus Memory", missing);
  }
  client ??= MemWal.create({ key: delegateKey, accountId, serverUrl: relayerUrl, namespace });
  return client;
}

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export const MAX_MEMORY_CHARS = 1500;
