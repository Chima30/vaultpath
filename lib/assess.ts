import type { RecalledItem } from "./types";

// Rule-based comparison of NEW on-chain evidence against RECALLED historical memory.
// This is a transparent heuristic, not a machine-learning model and not a
// determination of wrongdoing. Every point of the score is listed in `reasoning`.

export type AssessmentInput = {
  subject: string;
  counterparties: { address: string; interactions: number }[];
  transactionCount: number;
  recalled: (RecalledItem & { text: string })[];
};

export type AssessmentOutput = {
  verdict: "low" | "medium" | "high" | "inconclusive";
  score: number;
  summary: string;
  reasoning: string[];
  matchedAddresses: string[];
};

const ADDR = /0x[0-9a-fA-F]{1,64}/g;

function addressesIn(text: string): string[] {
  return [...text.matchAll(ADDR)].map((m) => "0x" + m[0].slice(2).toLowerCase().padStart(64, "0"));
}

export function assess(input: AssessmentInput): AssessmentOutput {
  const reasoning: string[] = [];
  let score = 0;

  if (input.transactionCount === 0) {
    return {
      verdict: "inconclusive",
      score: 0,
      summary: "No transactions were returned for this address, so there is nothing to compare against memory.",
      reasoning: ["Tatum returned zero transactions for the subject address."],
      matchedAddresses: [],
    };
  }

  const memoryAddrs = new Map<string, number>(); // address -> index of recalled item mentioning it
  input.recalled.forEach((r, i) => addressesIn(r.text).forEach((a) => memoryAddrs.set(a, i)));

  const subjectInMemory = memoryAddrs.has(input.subject);
  if (subjectInMemory) {
    score += 2;
    reasoning.push(`+2: the subject address appears in recalled memory #${(memoryAddrs.get(input.subject) ?? 0) + 1}, so it was seen in an earlier case.`);
  }

  const matched: string[] = [];
  for (const cp of input.counterparties) {
    const idx = memoryAddrs.get(cp.address);
    if (idx !== undefined) {
      matched.push(cp.address);
      score += 3;
      reasoning.push(`+3: counterparty ${short(cp.address)} (${cp.interactions} recent interaction${cp.interactions === 1 ? "" : "s"}) is named in recalled memory #${idx + 1}.`);
    }
  }

  if (input.counterparties.length >= 20) {
    score += 1;
    reasoning.push(`+1: ${input.counterparties.length} distinct counterparties in the last ${input.transactionCount} transactions (wide fan-out).`);
  }

  if (input.recalled.length === 0) {
    reasoning.push("No historical memory was recalled, so the comparison relies on on-chain evidence alone.");
  } else if (matched.length === 0 && !subjectInMemory) {
    reasoning.push(`${input.recalled.length} memories were recalled as semantically related, but none names this subject or any recent counterparty.`);
  }

  let verdict: AssessmentOutput["verdict"];
  if (score >= 3) verdict = "high";
  else if (score >= 1) verdict = "medium";
  else verdict = input.recalled.length === 0 ? "inconclusive" : "low";

  const summary =
    verdict === "high" || verdict === "medium"
      ? `Memory links this case to ${matched.length} recent counterpart${matched.length === 1 ? "y" : "ies"}${subjectInMemory ? " and to the subject itself" : ""}. Review the listed evidence before drawing conclusions.`
      : verdict === "low"
        ? "Recalled history did not connect to the subject or its recent counterparties."
        : "No historical context was available to compare against.";

  return { verdict, score, summary, reasoning, matchedAddresses: matched };
}

export function short(addr: string): string {
  return addr.length > 14 ? `${addr.slice(0, 8)}…${addr.slice(-6)}` : addr;
}
