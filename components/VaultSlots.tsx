import type { Receipt } from "@/lib/types";

// Ten slots, one per confirmed Walrus Memory write (status 'done' with a blob id).
// A slot is filled only by a receipt the relayer itself confirmed.
export function VaultSlots({ receipts, target = 10 }: { receipts: Receipt[]; target?: number }) {
  const confirmed = receipts.filter((r) => r.status === "done" && r.blob_id);
  const slots = Array.from({ length: Math.max(target, confirmed.length) }, (_, i) => confirmed[confirmed.length - 1 - i] ?? null);
  return (
    <div>
      <ol className="grid grid-cols-5 gap-2 sm:grid-cols-10" aria-label={`${confirmed.length} of ${target} confirmed Walrus memories`}>
        {slots.map((r, i) => (
          <li
            key={i}
            title={r?.blob_id ?? "empty"}
            className={`flex aspect-square items-center justify-center rounded-md border text-[10px] font-mono ${
              r ? "border-tide bg-tide/15 text-tide" : "border-dashed border-line text-muted/50"
            }`}
          >
            {r?.blob_id ? r.blob_id.slice(0, 4) : ""}
          </li>
        ))}
      </ol>
      <p className="mt-3 text-sm text-muted">
        <span className="font-display text-2xl text-text">{confirmed.length}</span> of {target} memories confirmed on Walrus Mainnet by the relayer
      </p>
    </div>
  );
}
