/**
 * The chat re-renders a streaming message from scratch on every delta, so every
 * prefix has to look sane, not just the final text. The prefix tests guard the
 * original bug: a half-typed fence leaking into prose ("bash" mid-sentence).
 *
 *   pnpm --filter @agent-office/web test src/components/ui/markdown-view.test.tsx
 */
import assert from "node:assert";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MarkdownView, type RenderCode } from "./markdown-view";
import { splitMarkdownBlocks, trimPartialFence } from "@/lib/markdown";

const codeCalls: Array<{ lang: string; body: string }> = [];
const renderCode: RenderCode = (lang, body) => {
  codeCalls.push({ lang, body });
  return <pre data-lang={lang}>{body}</pre>;
};

function html(text: string): string {
  return renderToStaticMarkup(<MarkdownView text={text} renderCode={renderCode} />);
}

/** Markup outside code blocks. */
function proseHtml(text: string): string {
  return html(text).replace(/<pre[^>]*>[\s\S]*?<\/pre>/g, "");
}

const MESSAGES = [
  "Let me check the config file:\n```bash\ncat package.json\n```\nDone.",
  "I updated `apps/web` — now run:\n```bash\npnpm typecheck\npnpm lint\n```\nIt passes.",
  "Two blocks:\n\n```ts\nconst a = 1;\n```\n\nand\n\n```bash\nls -la\n```\n\nthat's it.",
];

test("no streaming prefix leaks fence backticks into prose", () => {
  for (const full of MESSAGES) {
    for (let i = 1; i <= full.length; i++) {
      const prose = proseHtml(trimPartialFence(full.slice(0, i)));
      assert.ok(!prose.includes("``"), `prefix ${i}: ${prose}`);
    }
  }
});

test("a fence's language never renders half-typed, and its body only grows", () => {
  const full = MESSAGES[1]!;
  const langs = new Set<string>();
  let lastBody = "";
  for (let i = 1; i <= full.length; i++) {
    codeCalls.length = 0;
    html(trimPartialFence(full.slice(0, i)));
    for (const c of codeCalls) {
      langs.add(c.lang);
      assert.ok(c.body.startsWith(lastBody), `body shrank at ${i}`);
      lastBody = c.body;
    }
  }
  assert.deepStrictEqual([...langs], ["bash"]);
});

test("four-backtick fences keep inner triple fences as code (mission posts)", () => {
  codeCalls.length = 0;
  html("Post:\n\n````ao-post\nkind: result\n\n```ts\nconst a = 1;\n```\n````\n\nDone.");
  assert.strictEqual(codeCalls.length, 1);
  assert.strictEqual(codeCalls[0]!.lang, "ao-post");
  assert.ok(codeCalls[0]!.body.includes("```ts\nconst a = 1;\n```"));
});

test("blockquotes render as quotes, not a literal >", () => {
  const out = html("> **coordinator** · answer\n>\n> Thanks.");
  assert.match(out, /<blockquote>/);
  assert.ok(!out.includes("&gt;"));
  assert.match(out, /<strong>coordinator<\/strong>/);
});

test("markdown inside inline code stays literal", () => {
  const out = html("Run `a **b** [c](https://x.dev)` now");
  assert.match(out, /<code>a \*\*b\*\* \[c\]\(https:\/\/x\.dev\)<\/code>/);
});

test("only absolute http(s) and mailto links become links", () => {
  assert.match(html("[ok](https://example.com)"), /href="https:\/\/example\.com"/);
  assert.match(html("[mail](mailto:a@b.c)"), /href="mailto:a@b\.c"/);
  for (const bad of ["javascript:alert(1)", "//evil.example", "/\\evil.example", "/api/projects/p/uploads/x.svg", "data:text/html,x"]) {
    assert.ok(!html(`[x](${bad})`).includes("href"), bad);
  }
});

test("a link cannot break out of its href into an event handler", () => {
  const out = html('[log](https://x.dev/#"onmouseover="alert(1)"style="position:fixed"x=")');
  assert.ok(!/<a[^>]*\sonmouseover=/i.test(out), out);
});

test("raw HTML is never rendered", () => {
  const out = html('hi <img src=x onerror="alert(1)"> <script>alert(1)</script>');
  assert.ok(!out.includes("<img"));
  assert.ok(!out.includes("<script"));
});

test("GFM tables, task lists, headings and strikethrough render", () => {
  const out = html("# Title\n\n#### Small\n\n- [x] done\n- [ ] todo\n\n~~old~~\n\n| a | b |\n|---|--:|\n| 1 | 2 |");
  assert.match(out, /<h1>Title<\/h1>/);
  assert.match(out, /<h4>Small<\/h4>/);
  assert.match(out, /type="checkbox"/);
  assert.match(out, /<del>old<\/del>/);
  assert.match(out, /<table/);
});

const LONG = [
  "Intro paragraph.",
  "",
  "```ts\nconst a = 1;\n\nconst b = 2;\n```",
  "",
  "````ao-post\nkind: result\n\n```bash\nls\n```\n\nend\n````",
  "",
  "- item one\n\n    continued item text\n- item two",
  "",
  "Outro.",
].join("\n");

test("block splitting is lossless and never cuts a fence or an indented continuation", () => {
  const blocks = splitMarkdownBlocks(LONG);
  assert.strictEqual(blocks.join("\n"), LONG);
  assert.ok(blocks.some((b) => b.includes("const a = 1;\n\nconst b = 2;")));
  assert.ok(blocks.some((b) => b.includes("kind: result\n\n```bash\nls\n```\n\nend")));
  assert.ok(blocks.some((b) => b.includes("- item one\n\n    continued item text")));
});

test("no streaming prefix rendered block by block leaks fence backticks into prose", () => {
  for (let i = 1; i <= LONG.length; i++) {
    for (const block of splitMarkdownBlocks(trimPartialFence(LONG.slice(0, i)))) {
      assert.ok(!proseHtml(block).includes("``"), `prefix ${i}: ${proseHtml(block)}`);
    }
  }
});

test("a lone list or rule marker at the end of a stream never turns the paragraph into a heading", () => {
  assert.ok(!/<h\d/.test(html(trimPartialFence("Changes:\n-"))));
  assert.ok(!/<h\d/.test(html(trimPartialFence("Changes:\n=="))));
});

test("a line with inline triple backticks does not open a fence for the block splitter", () => {
  const text = "Use ```inline``` here.\n\n```ts\nconst a = 1;\n\nconst b = 2;\n```\n\nmore";
  assert.ok(splitMarkdownBlocks(text).some((b) => b.includes("const a = 1;\n\nconst b = 2;")));
});
