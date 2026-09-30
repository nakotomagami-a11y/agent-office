/**
 * Nested flow lists, and the depth bounds that keep them safe.
 *
 * `planet.customPalette` is `[number,number,number][][]` — three deep. The
 * serializer used to emit it as `-     - [1, 0, 0]`, which is not valid YAML,
 * and the parser returned inner lists as the raw string "[1, 0, 0]", so the
 * value was silently destroyed on every write.
 *
 * Making the parser recurse then introduced a worse failure: unbounded depth.
 * A hand-edited file could burn seconds of CPU and blow the stack, and there
 * was a window where parsing SUCCEEDED and re-serialising THREW — so an
 * unmodelled key round-tripping through project.md's `carry` would fail a
 * write uncaught instead of refusing cleanly. Both bounds are asserted here.
 *
 *   pnpm --filter @agent-office/domain test
 */
import assert from "node:assert";
import { test } from "node:test";
import { parseYaml, stringifyYaml, type YamlValue } from "./yaml";

function roundTrip(value: unknown): unknown {
  const doc = stringifyYaml({ k: value as YamlValue });
  return (parseYaml(doc) as Record<string, unknown>).k;
}

test("nested flow lists survive a round-trip", () => {
  for (const shape of [
    ["Read", "Bash"],
    [[1, 2], [3, 4]],
    [[[1, 0, 0], [0, 1, 0]], [[0, 0, 1]]], // the real customPalette shape
    [],
    [[]],
  ]) {
    assert.deepStrictEqual(roundTrip(shape), shape, `failed for ${JSON.stringify(shape)}`);
  }
});

test("a list of mappings still uses block style", () => {
  const roster = [{ instanceId: "developer-aaa", agentId: "developer" }];
  assert.deepStrictEqual(roundTrip(roster), roster);
  assert.match(stringifyYaml({ roster: roster as YamlValue }), /^roster:\n- instanceId:/m);
});

test("a string that merely looks like a list stays a string", () => {
  assert.strictEqual(roundTrip("[1, 2]"), "[1, 2]");
  assert.strictEqual(roundTrip("a[b],c ]x["), "a[b],c ]x[");
});

test("pathological nesting is bounded, not fatal", () => {
  // Was: ~6.9s then RangeError. These files are hand-editable, so an
  // unbounded parse is a self-inflicted stall in the server.
  const doc = "k: " + "[".repeat(20_000) + "1" + "]".repeat(20_000);
  const started = Date.now();
  const parsed = (parseYaml(doc) as Record<string, unknown>).k;
  assert.ok(Date.now() - started < 2_000, "deep parse must stay bounded");
  // The load-bearing half: whatever the parser produced must re-serialise.
  assert.doesNotThrow(() => stringifyYaml({ k: parsed as YamlValue }));
});

test("malformed brackets are tolerated rather than thrown", () => {
  for (const doc of ["k: [a, b", "k: [a, b]]", "k: [", "k: ]", 'k: ["a]b", c]']) {
    assert.doesNotThrow(() => parseYaml(doc), `threw on ${doc}`);
  }
});
