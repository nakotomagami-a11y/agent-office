// Sprite-related display helpers for agents.

export function shortName(name: string): string {
  // First word, capped at 6 chars. "Frontend Architect" → "Front…"; "Arc" → "Arc".
  const first = name.split(/\s+/)[0] ?? name;
  return first.length > 6 ? first.slice(0, 5) + "…" : first;
}
