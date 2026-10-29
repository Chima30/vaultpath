import "server-only";

// All secrets are read here, on the server, from process.env. Nothing in this
// file or anything importing it can be bundled into client code ("server-only").

export const config = {
  supabase: {
    url: process.env.SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  },
  memwal: {
    accountId: process.env.MEMWAL_ACCOUNT_ID,
    delegateKey: process.env.MEMWAL_DELEGATE_KEY,
    relayerUrl: process.env.MEMWAL_RELAYER_URL || "https://relayer.memory.walrus.xyz",
    namespace: process.env.MEMWAL_NAMESPACE || "vaultpath",
  },
  tatum: {
    apiKey: process.env.TATUM_API_KEY,
    rpcUrl: process.env.TATUM_SUI_RPC_URL || "https://sui-mainnet.gateway.tatum.io",
  },
  accessPasswordSet: Boolean(process.env.VAULTPATH_ACCESS_PASSWORD),
};

export type ConfigStatus = {
  supabase: boolean;
  memwal: boolean;
  tatum: boolean;
  accessGate: boolean;
  relayerUrl: string;
  relayerIsMainnet: boolean;
  namespace: string;
  tatumUrl: string;
  tatumIsMainnet: boolean;
};

export function configStatus(): ConfigStatus {
  const relayer = config.memwal.relayerUrl;
  return {
    supabase: Boolean(config.supabase.url && config.supabase.serviceKey),
    memwal: Boolean(config.memwal.accountId && config.memwal.delegateKey),
    tatum: Boolean(config.tatum.apiKey),
    accessGate: config.accessPasswordSet,
    relayerUrl: relayer,
    relayerIsMainnet: relayer.startsWith("https://relayer.memory.walrus.xyz"),
    namespace: config.memwal.namespace,
    tatumUrl: config.tatum.rpcUrl,
    tatumIsMainnet: config.tatum.rpcUrl.includes("sui-mainnet"),
  };
}
