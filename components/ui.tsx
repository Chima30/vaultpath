import type { ReactNode } from "react";

export function Panel({ title, action, children, className = "" }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-line bg-panel ${className}`}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          {title && <h2 className="font-display text-lg text-text">{title}</h2>}
          {action}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

const TONES = {
  neutral: "border-line text-muted",
  ok: "border-ok/50 text-ok",
  warn: "border-brass/60 text-brass",
  bad: "border-danger/60 text-danger",
  info: "border-tide/60 text-tide",
} as const;

export function Badge({ tone = "neutral", children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs ${TONES[tone]}`}>{children}</span>;
}

export function Notice({ tone = "warn", title, children }: { tone?: "warn" | "bad" | "info"; title: string; children?: ReactNode }) {
  const border = tone === "bad" ? "border-danger/50" : tone === "info" ? "border-tide/50" : "border-brass/50";
  return (
    <div role="note" className={`rounded-md border ${border} bg-raised px-4 py-3 text-sm`}>
      <p className="font-medium text-text">{title}</p>
      {children && <div className="mt-1 text-muted">{children}</div>}
    </div>
  );
}

export function NotConfigured({ what, vars }: { what: string; vars: string[] }) {
  return (
    <Notice title={`${what} is not configured`}>
      Set <span className="font-mono text-text">{vars.join(", ")}</span> in the deployment environment. Nothing is shown here until the real service answers.
    </Notice>
  );
}

export function VerdictBadge({ verdict }: { verdict: string }) {
  const tone = verdict === "high" ? "bad" : verdict === "medium" ? "warn" : verdict === "low" ? "ok" : "neutral";
  return <Badge tone={tone}>{verdict}</Badge>;
}

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="font-display text-3xl text-text">{title}</h1>
      {children && <p className="mt-1.5 max-w-2xl text-sm text-muted">{children}</p>}
    </div>
  );
}
