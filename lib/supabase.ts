import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "./config";
import { NotConfiguredError } from "./errors";

let client: SupabaseClient | null = null;

export function getDb(): SupabaseClient {
  const { url, serviceKey } = config.supabase;
  if (!url || !serviceKey) {
    const missing = [!url && "SUPABASE_URL", !serviceKey && "SUPABASE_SERVICE_ROLE_KEY"].filter(Boolean) as string[];
    throw new NotConfiguredError("Supabase", missing);
  }
  client ??= createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}
