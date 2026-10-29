export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; code?: string; data?: unknown };

export async function api<T = unknown>(url: string, method: "GET" | "POST" = "POST", body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => null);
    if (!json) return { ok: false, error: `Unexpected response (HTTP ${res.status})` };
    return json as ApiResult<T>;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error" };
  }
}
