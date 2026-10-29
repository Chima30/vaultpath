export class NotConfiguredError extends Error {
  constructor(public integration: string, public missing: string[]) {
    super(`${integration} is not configured. Missing: ${missing.join(", ")}`);
    this.name = "NotConfiguredError";
  }
}

export class UpstreamError extends Error {
  constructor(public integration: string, message: string) {
    super(message);
    this.name = "UpstreamError";
  }
}

export function errorMessage(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  return m.length > 400 ? m.slice(0, 400) + "..." : m;
}
