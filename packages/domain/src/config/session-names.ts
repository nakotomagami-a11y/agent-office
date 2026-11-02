/**
 * Session names: a stable, human name per roster instance instead of "Session 3".
 * Pure, so the server and every client derive the same name from the same roster.
 */

/** Short, pronounceable, fits the Tiny Swords cast. Order is part of the contract: reordering renames sessions. */
export const SESSION_NAMES = [
  "Brann", "Elda", "Rook", "Maren", "Tobin", "Isolde", "Garrick", "Wren", "Aldric", "Bryn",
  "Cedric", "Della", "Edric", "Fenna", "Gideon", "Hilda", "Ivo", "Jora", "Kael", "Lyra",
  "Magnus", "Nell", "Osric", "Petra", "Quill", "Rowan", "Sigrid", "Tamsin", "Ulric", "Vesna",
  "Wynn", "Yara", "Alwin", "Beatrix", "Corwin", "Dagny", "Emeric", "Freya", "Godric", "Hale",
  "Ingrid", "Jasper", "Kestra", "Leofric", "Mira", "Nils", "Odette", "Percival", "Runa", "Soren",
  "Thora", "Ulla", "Viggo", "Willa", "Astrid", "Bram", "Cora", "Dunstan", "Elric", "Gwen",
] as const;

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/**
 * The display name of every instance in `roster`, keyed by instanceId. A user label wins; the rest get
 * a pool name seeded by their id, probing past names already taken in this roster so two sessions
 * never share one. Labelled instances claim their names first, so a rename never shifts the others.
 */
export function sessionNames(roster: ReadonlyArray<{ instanceId: string; label?: string }>): Map<string, string> {
  const out = new Map<string, string>();
  const taken = new Set<string>();
  for (const inst of roster) {
    const label = inst.label?.trim();
    if (!label) continue;
    out.set(inst.instanceId, label);
    taken.add(label.toLowerCase());
  }
  for (const inst of roster) {
    if (out.has(inst.instanceId)) continue;
    const start = fnv1a(inst.instanceId) % SESSION_NAMES.length;
    let name: string = SESSION_NAMES[start]!;
    for (let i = 0; i < SESSION_NAMES.length && taken.has(name.toLowerCase()); i++) {
      name = SESSION_NAMES[(start + i + 1) % SESSION_NAMES.length]!;
    }
    // A roster larger than the pool: numbered, still unique.
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${SESSION_NAMES[start]!} ${n}`;
    out.set(inst.instanceId, name);
    taken.add(name.toLowerCase());
  }
  return out;
}

const TOPIC_MAX_CHARS = 42;
const FILLER = /^(?:(?:please|pls|hey|hi|ok(?:ay)?|so|can you|could you|would you|i want you to|i need you to|let'?s|we need to)[\s,:]+)+/i;

/** A short "what this session is about" line from its first prompt, or null when nothing readable is left. */
export function sessionTopic(prompt: string | null | undefined): string | null {
  if (!prompt) return null;
  const firstLine = prompt
    .replace(/```[\s\S]*?(```|$)/g, " ")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!firstLine) return null;
  let text = firstLine
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[`*_#>[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(FILLER, "");
  // The first sentence reads as a topic; a fragment shorter than three words does not.
  const sentence = text.split(/(?<=[.!?])\s+/)[0]!;
  if (sentence.split(" ").length >= 3) text = sentence;
  text = text.replace(/[.!?:;,\s]+$/, "");
  if (!text) return null;
  text = text.charAt(0).toLowerCase() + text.slice(1);
  if (text.length <= TOPIC_MAX_CHARS) return text;
  const cut = text.slice(0, TOPIC_MAX_CHARS + 1);
  const atWord = cut.lastIndexOf(" ");
  return `${(atWord > 16 ? cut.slice(0, atWord) : cut.slice(0, TOPIC_MAX_CHARS)).replace(/[.,;:\s]+$/, "")}…`;
}
