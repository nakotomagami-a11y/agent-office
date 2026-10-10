import assert from "node:assert";
import { test } from "node:test";
import { MAX_DIFF_LINES_PER_FILE } from "../../config/review";
import { parseUnifiedDiff } from "./diff";

const MODIFIED = `diff --git a/src/format.ts b/src/format.ts
index 1111111..2222222 100644
--- a/src/format.ts
+++ b/src/format.ts
@@ -5,3 +5,4 @@ const MINUTE = 60_000;
 const HOUR = 60 * MINUTE;
-const DAY = 24 * HOUR;
+const DAY = 24 * HOUR; // ms
+const WEEK = 7 * DAY;
 export {};
`;

test("numbers context, added and removed lines on both sides", () => {
  const [f] = parseUnifiedDiff(MODIFIED);
  assert.ok(f);
  assert.deepStrictEqual([f.path, f.status, f.additions, f.deletions, f.binary], ["src/format.ts", "modified", 2, 1, false]);
  const [h] = f.hunks;
  assert.ok(h);
  assert.deepStrictEqual([h.oldStart, h.newStart, h.section], [5, 5, "const MINUTE = 60_000;"]);
  assert.deepStrictEqual(
    h.lines.map((l) => [l.kind, l.oldLine, l.newLine, l.text]),
    [
      ["context", 5, 5, "const HOUR = 60 * MINUTE;"],
      ["del", 6, null, "const DAY = 24 * HOUR;"],
      ["add", null, 6, "const DAY = 24 * HOUR; // ms"],
      ["add", null, 7, "const WEEK = 7 * DAY;"],
      ["context", 7, 8, "export {};"],
    ],
  );
});

test("added, deleted, renamed and binary files", () => {
  const files = parseUnifiedDiff(`diff --git a/new.ts b/new.ts
new file mode 100644
--- /dev/null
+++ b/new.ts
@@ -0,0 +1 @@
+export const x = 1;
diff --git a/old.ts b/old.ts
deleted file mode 100644
--- a/old.ts
+++ /dev/null
@@ -1 +0,0 @@
-gone
diff --git a/a dir/from.ts b/a dir/to.ts
similarity index 90%
rename from a dir/from.ts
rename to a dir/to.ts
diff --git a/logo.png b/logo.png
Binary files a/logo.png and b/logo.png differ
`);
  assert.deepStrictEqual(
    files.map((f) => [f.status, f.oldPath, f.path, f.binary, f.additions, f.deletions]),
    [
      ["added", "new.ts", "new.ts", false, 1, 0],
      ["deleted", "old.ts", "old.ts", false, 0, 1],
      ["renamed", "a dir/from.ts", "a dir/to.ts", false, 0, 0],
      ["modified", "logo.png", "logo.png", true, 0, 0],
    ],
  );
});

test("'no newline' markers and CRLF output are not diff lines", () => {
  const [f] = parseUnifiedDiff(MODIFIED.replace("+const WEEK = 7 * DAY;\n", "+const WEEK = 7 * DAY;\n\\ No newline at end of file\n").replace(/\n/g, "\r\n"));
  assert.ok(f);
  assert.strictEqual(f.hunks[0]?.lines.length, 5);
  assert.strictEqual(f.hunks[0]?.lines[3]?.text, "const WEEK = 7 * DAY;");
});

test("a huge file is cut but still counted in full", () => {
  const n = MAX_DIFF_LINES_PER_FILE + 10;
  const body = Array.from({ length: n }, (_, i) => `+line ${i}`).join("\n");
  const [f] = parseUnifiedDiff(`diff --git a/big.txt b/big.txt\n--- /dev/null\n+++ b/big.txt\n@@ -0,0 +1,${n} @@\n${body}\n`);
  assert.ok(f);
  assert.strictEqual(f.additions, n);
  assert.strictEqual(f.truncated, true);
  assert.strictEqual(f.hunks[0]?.lines.length, MAX_DIFF_LINES_PER_FILE);
});

test("a line that looks like a header inside a hunk is content", () => {
  const [f] = parseUnifiedDiff(`diff --git a/x.md b/x.md
--- a/x.md
+++ b/x.md
@@ -1,2 +1,2 @@
---- a heading rule
+--- changed rule
 rename from nowhere
`);
  assert.ok(f);
  assert.deepStrictEqual([f.path, f.status, f.additions, f.deletions], ["x.md", "modified", 1, 1]);
  assert.strictEqual(f.hunks[0]?.lines[0]?.text, "--- a heading rule");
});

test("C-quoted paths (non-ASCII, quotes, renames) round-trip to the real name", () => {
  const files = parseUnifiedDiff(String.raw`diff --git "a/caf\303\251.txt" "b/caf\303\251.txt"
--- "a/caf\303\251.txt"
+++ "b/caf\303\251.txt"
@@ -1 +1 @@
-a
+b
diff --git "a/say \"hi\".md" "b/say \"hi\".md"
Binary files "a/say \"hi\".md" and "b/say \"hi\".md" differ
diff --git "a/\346\227\247.ts" "b/\346\226\260.ts"
similarity index 100%
rename from "\346\227\247.ts"
rename to "\346\226\260.ts"
`);
  assert.deepStrictEqual(files.map((f) => [f.oldPath, f.path]), [
    ["café.txt", "café.txt"],
    ['say "hi".md', 'say "hi".md'],
    ["旧.ts", "新.ts"],
  ]);
});
