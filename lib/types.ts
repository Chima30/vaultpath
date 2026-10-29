export type Investigation = {
  id: string;
  title: string;
  subject_address: string;
  network: string;
  status: "open" | "monitoring" | "closed";
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type Evidence = {
  id: string;
  investigation_id: string;
  kind: "tatum_balances" | "tatum_transactions" | "analyst_note";
  source_methods: string[];
  latest_checkpoint: string | null;
  payload: Record<string, unknown>;
  fetched_at: string;
};

export type RecalledItem = { blob_id: string; distance: number; preview: string };

export type Assessment = {
  id: string;
  investigation_id: string;
  verdict: "low" | "medium" | "high" | "inconclusive";
  score: number;
  method: string;
  summary: string;
  reasoning: string[];
  recalled_count: number;
  recalled_context: RecalledItem[];
  evidence_ids: string[];
  created_at: string;
};

export type Receipt = {
  id: string;
  investigation_id: string | null;
  assessment_id: string | null;
  namespace: string;
  job_id: string;
  blob_id: string | null;
  owner_address: string | null;
  status: "accepted" | "done" | "failed";
  error: string | null;
  content_sha256: string;
  content_preview: string;
  created_at: string;
  confirmed_at: string | null;
};

export type TxSummary = {
  digest: string;
  timestampMs: string | null;
  sender: string | null;
  balanceChanges: { owner: string | null; coinType: string; amount: string }[];
};
