export function shortAddr(a: string): string {
  return a.length > 16 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a;
}

export function when(iso: string | null | undefined): string {
  if (!iso) return "-";
  return new Date(iso).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}
