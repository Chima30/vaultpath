// Ten clearly-labelled SYNTHETIC typology notes. They are real writes to Walrus
// Memory when submitted, but their content is generic analyst guidance, not
// real case history. Replace or supplement them with your own real case notes.
export const SAMPLE_MEMORIES: string[] = [
  "[VaultPath synthetic demo] Typology: a large inbound SUI transfer followed within minutes by fan-out to many newly active addresses is a common layering pattern worth escalating for review.",
  "[VaultPath synthetic demo] Typology: repeated round-number transfers between the same two addresses at regular intervals can indicate scripted payments or structuring.",
  "[VaultPath synthetic demo] Typology: a fresh address that only ever receives from one source and forwards everything onward within one epoch behaves like a pass-through relay.",
  "[VaultPath synthetic demo] Typology: sudden activity from a long-dormant address after years of inactivity deserves a check for key compromise or sold accounts.",
  "[VaultPath synthetic demo] Typology: many small deposits from unrelated addresses into one collector address, followed by a single large withdrawal, resembles a mule or collection pattern.",
  "[VaultPath synthetic demo] Investigation practice: always record the exact full 0x address of any counterparty you flag, since recall works best when the address is written out in the note.",
  "[VaultPath synthetic demo] Investigation practice: when a flagged counterparty reappears in a later case, escalate the later case and link the two investigations.",
  "[VaultPath synthetic demo] Investigation practice: balance changes in non-SUI coin types should be reviewed separately, because token transfers can hide behind small SUI gas movements.",
  "[VaultPath synthetic demo] Investigation practice: note the latest checkpoint at the time of review so later analysts know which on-chain state a conclusion was based on.",
  "[VaultPath synthetic demo] Investigation practice: a heuristic match is a lead, not proof; confirm against an independent explorer before concluding anything about an address owner.",
];
