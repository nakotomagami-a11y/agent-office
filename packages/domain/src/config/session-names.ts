/**
 * Session names: a human name per roster instance instead of "Session 3", and a topic line.
 * Pure: the project GET derives both from the roster and the current conversation.
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
 * never share a pool name. Stable while the roster is: removing a session, or labelling another one
 * with its name, can move a session whose seed collided onto the next free name.
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
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${SESSION_NAMES[start]!} ${n}`;
    out.set(inst.instanceId, name);
    taken.add(name.toLowerCase());
  }
  return out;
}

const TOPIC_MAX_CHARS = 42;
// Runs on every project read: every regex below sees at most this much, so none can backtrack far.
const TOPIC_INPUT_CHARS = 300;
const FILLER = /^(?:(?:please|pls|hey|hi|ok(?:ay)?|so|can you|could you|would you|i want you to|i need you to|let'?s|we need to)[\s,:]+)+/i;
const TRAILING = new Set([".", "!", "?", ":", ";", ",", " "]);

function readableLine(line: string): string {
  return line
    .slice(0, TOPIC_INPUT_CHARS)
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[`*]/g, "")
    .replace(/^\s*[#>]+\s*/, "")
    .replace(/\[([^\]]*)\]/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .replace(FILLER, "");
}

/** A short "what this session is about" line from its first prompt, or null when nothing readable is left. */
export function sessionTopic(prompt: string | null | undefined): string | null {
  if (!prompt) return null;
  const lines = prompt.slice(0, 4 * TOPIC_INPUT_CHARS).replace(/```[\s\S]*?(```|$)/g, " ").split(/\r?\n/);
  let text = "";
  for (const line of lines) {
    text = readableLine(line);
    if (text) break;
  }
  if (!text) return null;
  // The first sentence reads as a topic; a fragment shorter than three words does not.
  const sentence = text.split(/(?<=[.!?])\s+/)[0]!;
  if (sentence.split(" ").length >= 3) text = sentence;
  while (text && TRAILING.has(text.at(-1)!)) text = text.slice(0, -1);
  if (!text) return null;
  // "Fix the drag" reads as a topic lowercased; "API returns 500" and "I want…" must keep their capitals.
  if (/^\p{Lu}\p{Ll}/u.test(text)) text = text[0]!.toLowerCase() + text.slice(1);
  const chars = Array.from(text);
  if (chars.length <= TOPIC_MAX_CHARS) return text;
  const cut = chars.slice(0, TOPIC_MAX_CHARS + 1).join("");
  const atWord = cut.lastIndexOf(" ");
  let head = atWord > 16 ? cut.slice(0, atWord) : chars.slice(0, TOPIC_MAX_CHARS).join("");
  while (head && TRAILING.has(head.at(-1)!)) head = head.slice(0, -1);
  return `${head}…`;
}
