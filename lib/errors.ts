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

export type TatumErrorKind =
  | "rate_limited"
  | "unavailable"
  | "auth"
  | "invalid_request"
  | "unsupported"
  | "not_found"
  | "timeout"
  | "other";

export class TatumGrpcError extends UpstreamError {
  attempts = 1;
  constructor(
    public grpcCode: number,
    public method: string,
    public kind: TatumErrorKind,
    public httpStatus: number | null,
    public retryAfterMs: number | null,
    public headers: Record<string, string>,
    message: string,
  ) {
    super("tatum", message);
    this.name = "TatumGrpcError";
  }
}
