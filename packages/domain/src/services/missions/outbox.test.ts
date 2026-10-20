import assert from "node:assert";
import { test } from "node:test";
import { MAX_COMMENT_CHARS, MISSION_ERROR_CODES, MISSION_ERROR_REMEDIATION } from "../../config/missions";
import { parseOutbox } from "./outbox";

const roster = ["coordinator", "macos", "windows", "linux"];
const block = (header: string, body = "x", fence = "```") => `${fence}ao-post\n${header}\n---\n${body}\n${fence}`;
const codes = (out: string, seat = "macos") => parseOutbox(out, seat, roster).errors.map((e) => e.code);

test("reads one post with recipients, a reply id and a multi-line body", () => {
  const out = `Done measuring.\n\n${block("to: coordinator, linux\nkind: result\nre: 42", "## T1\nAVD lit.")}\n`;
  assert.deepStrictEqual(parseOutbox(out, "macos", roster), {
    posts: [{ kind: "result", to: ["coordinator", "linux"], re: 42, text: "## T1\nAVD lit." }],
    errors: [],
  });
});

test("a longer fence lets the body carry its own code block", () => {
  const { posts, errors } = parseOutbox(block("to: coordinator\nkind: result", "Run:\n```\nioreg -r -c AppleAVD\n```\nlit.", "````"), "macos", roster);
  assert.deepStrictEqual(errors, []);
  assert.strictEqual(posts[0]?.text, "Run:\n```\nioreg -r -c AppleAVD\n```\nlit.");
});

test("an ao-post shown inside another code block is quoted, never posted", () => {
  const example = block("to: all\nkind: answer", "Yes, install it.");
  for (const outer of ["````markdown", "~~~", "````"]) {
    const close = outer.startsWith("~") ? "~~~" : "````";
    assert.deepStrictEqual(parseOutbox(`Linux wrote:\n${outer}\n${example}\n${close}\nI disagree.`, "macos", roster), { posts: [], errors: [] }, outer);
  }
});

test("a post whose body shows the format posts once, not twice", () => {
  const out = block("to: linux\nkind: answer", `Use this shape:\n${block("to: x\nkind: result")}`, "````");
  const { posts, errors } = parseOutbox(out, "macos", roster);
  assert.deepStrictEqual([posts.length, errors], [1, []]);
});

test("CommonMark openers: indented up to 3, spaced info, extra info words, tildes", () => {
  for (const open of [" ```ao-post", "   ```ao-post", "``` ao-post", "```ao-post title", "~~~ao-post"]) {
    const close = open.includes("~") ? "~~~" : "```";
    const { posts } = parseOutbox(`${open}\nto: linux\nkind: result\n---\nok\n${close}`, "macos", roster);
    assert.strictEqual(posts.length, 1, JSON.stringify(open));
  }
  assert.strictEqual(parseOutbox("    ```ao-post\nto: linux\nkind: result\n---\nok\n    ```", "macos", roster).posts.length, 0);
});

test("an inner ```lang under the same fence would cut the post: refused, not truncated", () => {
  const out = block("to: linux\nkind: result", "Run:\n```bash\nls\n```\nthen read it");
  assert.deepStrictEqual(codes(out), ["outbox_inner_fence"]);
});

test("several blocks, CRLF output, human and all as recipients", () => {
  const out = [block("to: human\nkind: question", "May I install Firefox?"), block("to: all\nkind: answer", "Yes.")].join("\n").replace(/\n/g, "\r\n");
  const { posts } = parseOutbox(out, "windows", roster);
  assert.deepStrictEqual(posts.map((p) => [p.kind, p.to]), [["question", ["human"]], ["answer", ["all"]]]);
});

test("output without a block posts nothing", () => {
  assert.deepStrictEqual(parseOutbox("Just thinking out loud.", "macos", roster), { posts: [], errors: [] });
});

test("a seat cannot post a control kind such as accept or decision", () => {
  for (const kind of ["accept", "decision", "reply", "pause", "close"]) {
    assert.deepStrictEqual(codes(block(`to: coordinator\nkind: ${kind}`)), ["outbox_kind_unknown"], kind);
  }
});

test("only the coordinator steers: briefs and work orders from a seat are refused", () => {
  assert.deepStrictEqual(codes(block("to: all\nkind: work-order"), "linux"), ["outbox_kind_forbidden"]);
  assert.deepStrictEqual(codes(block("to: all\nkind: work-order"), "coordinator"), []);
});

test("recipients: on the roster, human or all, never the sender, at most 16, deduplicated", () => {
  assert.deepStrictEqual(codes(block("to: android\nkind: result")), ["outbox_recipient_invalid"]);
  assert.deepStrictEqual(codes(block("to: macos\nkind: result")), ["outbox_recipient_invalid"]);
  assert.deepStrictEqual(codes(block("to:  , \nkind: result")), ["outbox_recipient_invalid"]);
  const big = Array.from({ length: 17 }, (_, i) => `s${i}`);
  assert.deepStrictEqual(parseOutbox(block(`to: ${big.join(", ")}\nkind: result`), "macos", big).errors.map((e) => e.code), ["outbox_recipient_invalid"]);
  assert.deepStrictEqual(parseOutbox(block("to: linux, linux\nkind: result"), "macos", roster).posts[0]?.to, ["linux"]);
});

test("header: only to, kind, re, supersedes, each once; blank lines are fine", () => {
  assert.deepStrictEqual(codes(block("to: linux\nkind: result\nfrom: windows")), ["outbox_header_unknown"]);
  assert.deepStrictEqual(codes(block("to: linux\nkind: result\nkind: blocker")), ["outbox_header_unknown"]);
  const { posts } = parseOutbox(block("\nto: linux\n\nkind: result\nsupersedes: 7"), "macos", roster);
  assert.deepStrictEqual([posts[0]?.kind, posts[0]?.supersedes], ["result", 7]);
});

test("re and supersedes must be real comment ids", () => {
  for (const v of ["12abc", "0", "1e3", "-4", "99999999999999999999"]) {
    assert.deepStrictEqual(codes(block(`to: linux\nkind: result\nre: ${v}`)), ["outbox_id_invalid"], v);
    assert.deepStrictEqual(codes(block(`to: linux\nkind: result\nsupersedes: ${v}`)), ["outbox_id_invalid"], v);
  }
});

test("malformed blocks are reported, and good blocks around them still post", () => {
  const out = [
    "```ao-post\nto: linux\nkind: result\nbody without separator\n```",
    block("to: linux\nkind: result", "   "),
    block("to: linux\nkind: result", "fine"),
  ].join("\n");
  const { posts, errors } = parseOutbox(out, "macos", roster);
  assert.deepStrictEqual(errors.map((e) => e.code), ["outbox_malformed", "outbox_empty"]);
  assert.deepStrictEqual(posts.map((p) => p.text), ["fine"]);
});

test("an unclosed block is reported, not swallowed silently", () => {
  const { posts, errors } = parseOutbox("```ao-post\nto: linux\nkind: result\n---\nforgot the fence", "macos", roster);
  assert.deepStrictEqual([posts.length, errors[0]?.code], [0, "outbox_malformed"]);
});

test("a body too long for one GitHub comment is refused", () => {
  assert.deepStrictEqual(codes(block("to: linux\nkind: result", "x".repeat(MAX_COMMENT_CHARS))), ["outbox_too_long"]);
});

test("every error code tells the agent how to fix it", () => {
  for (const code of MISSION_ERROR_CODES) assert.ok(MISSION_ERROR_REMEDIATION[code].length > 20, code);
});

test("a bare inner fence that cut the post short is refused, not posted truncated", () => {
  const out = "```ao-post\nto: linux\nkind: result\n---\nRun:\n```\nls\n```\nthen read it\n```";
  assert.deepStrictEqual(codes(out), ["outbox_inner_fence"]);
  assert.deepStrictEqual(parseOutbox(`${block("to: linux\nkind: result", "fine")}\nDone for now.`, "macos", roster).posts.length, 1);
});

test("an unclosed fence before a post reports the post it swallowed", () => {
  const out = `\`\`\`bash\nls\n\n${block("to: linux\nkind: result", "ok")}`;
  const { posts, errors } = parseOutbox(out, "macos", roster);
  assert.deepStrictEqual([posts.length, errors.map((e) => e.code)], [0, ["outbox_malformed"]]);
});
