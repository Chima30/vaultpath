import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { NotConfiguredError, TatumGrpcError, UpstreamError, errorMessage } from "./errors";

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ ok: true, data }, { status });
}

export function fail(e: unknown) {
  if (e instanceof NotConfiguredError) {
    return NextResponse.json({ ok: false, code: "not_configured", error: e.message, missing: e.missing }, { status: 503 });
  }
  if (e instanceof ZodError) {
    return NextResponse.json({ ok: false, code: "bad_request", error: e.issues.map((i) => i.message).join("; ") }, { status: 400 });
  }
  if (e instanceof TatumGrpcError && e.kind === "rate_limited") {
    return NextResponse.json(
      { ok: false, code: "rate_limited", integration: "tatum", error: errorMessage(e), retryAfterMs: e.retryAfterMs },
      { status: 429 },
    );
  }
  if (e instanceof UpstreamError) {
    return NextResponse.json({ ok: false, code: "upstream_error", integration: e.integration, error: errorMessage(e) }, { status: 502 });
  }
  const msg = errorMessage(e);
  if (/is not configured\. Missing:/.test(msg)) {
    return NextResponse.json({ ok: false, code: "not_configured", error: msg }, { status: 503 });
  }
  return NextResponse.json({ ok: false, code: "error", error: msg }, { status: 500 });
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
