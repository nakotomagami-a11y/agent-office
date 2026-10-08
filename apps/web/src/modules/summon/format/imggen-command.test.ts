/**
 * The chat draws one placeholder per image from the Bash command alone, so the
 * parse must agree with imggen's argparse: a command imggen would reject, or whose
 * name/seed only the shell knows, must yield no job (placeholders that never fill),
 * and a mention of "imggen" that isn't a run (grep, heredoc, comment) must not count.
 *
 *   pnpm exec tsx --test src/modules/summon/format/imggen-command.test.ts
 */
import assert from "node:assert";
import { test } from "node:test";
import { imggenSlug } from "@agent-office/domain/config/generated-images";
import { imggenJobsFromToolArg, parseImggenCommand } from "./imggen-command";

const one = (cmd: string) => {
  const jobs = parseImggenCommand(cmd);
  assert.equal(jobs.length, 1, cmd);
  return jobs[0]!;
};

test("imggenSlug matches imggen's Python expression (fixtures from python3)", () => {
  const fixtures: Array<[string, string]> = [
    ["Minimal Logo: a FOX head!!", "minimal-logo-a-fox-head"],
    ["treasure-chest", "treasure-chest"],
    ["  --weird__name--  ", "weird-name"],
    ["ÜBER café 東京", "ber-caf"],
    ["a".repeat(60), "a".repeat(40)],
    ["!!!", "image"],
    ["Cat Pics 2", "cat-pics-2"],
  ];
  for (const [input, slug] of fixtures) assert.equal(imggenSlug(input), slug, input);
});

test("the command used in this repo's first real run", () => {
  const cmd = `cd /tmp && ~/.local/bin/imggen "cute pixel art treasure chest, 16-bit" --name treasure-chest --seed 2026 2>&1 | grep -v "it/s" | tail -3`;
  assert.deepEqual(parseImggenCommand(cmd), [{ slug: "treasure-chest", count: 1, seeds: [2026], background: false, offset: 0 }]);
});

test("count and seed give one placeholder and one known seed per image", () => {
  assert.deepEqual(one(`imggen 'a cat' --name cats -c 3 --seed 10`).seeds, [10, 11, 12]);
  assert.deepEqual(one(`imggen "a cat" --count=2 --name=Cats`), { slug: "cats", count: 2, seeds: null, background: false, offset: 0 });
  assert.equal(one(`imggen x -c4`).count, 4);
});

test("argparse's unique-prefix abbreviations are honoured; ambiguous ones are rejected", () => {
  assert.deepEqual(one(`imggen x --see 5 --cou 2 --nam fox`), { slug: "fox", count: 2, seeds: [5, 6], background: false, offset: 0 });
  assert.deepEqual(parseImggenCommand(`imggen x --n fox`), []);
});

test("without --name the slug comes from the prompt, like imggen", () => {
  const job = one(`imggen "Minimal Logo: a FOX head!!" -W 768 -H 512 -n "blurry, text"`);
  assert.equal(job.slug, "minimal-logo-a-fox-head");
  assert.equal(job.seeds, null);
});

test("value flags don't steal the prompt and escaped quotes stay in it", () => {
  assert.equal(one(`imggen --steps 20 --cfg 6.5 "say \\"hi\\"" --checkpoint x.safetensors`).slug, "say-hi");
  assert.equal(one(`imggen -- "-dash prompt" `).slug, "dash-prompt");
});

test("backslash-newline continuations join the command", () => {
  assert.deepEqual(one(`imggen \\\n  "a red fox" \\\n  --seed 5 -c 2`), { slug: "a-red-fox", count: 2, seeds: [5, 6], background: false, offset: 0 });
  assert.deepEqual(one(`imggen "a fox" --seed \\\n 5`).seeds, [5]);
});

test("redirects are not arguments", () => {
  assert.deepEqual(one(`imggen "fox" --seed 3 2>&1 >/tmp/log`).seeds, [3]);
  assert.deepEqual(one(`imggen "fox" > /tmp/log --seed 3`).seeds, [3]);
});

test("chained runs each become a job; prefixes and env assignments are allowed", () => {
  const jobs = parseImggenCommand(`imggen a --name one && FOO=1 nohup imggen b --name two; time imggen c --name three\nimggen d --name four`);
  assert.deepEqual(jobs.map((j) => j.slug), ["one", "two", "three", "four"]);
});

test("a trailing & or run_in_background marks the job as background", () => {
  assert.equal(one(`nohup imggen x --seed 1 > /dev/null 2>&1 &`).background, true);
  const arg = JSON.stringify({ command: `imggen x --seed 1`, run_in_background: true });
  assert.equal(imggenJobsFromToolArg("Bash", arg)[0]!.background, true);
});

test("mentions that are not a run are ignored", () => {
  assert.deepEqual(parseImggenCommand(`grep -n imggen ~/.local/bin/imggen`), []);
  assert.deepEqual(parseImggenCommand(`cat > f.ts <<'EOF'\n// Reads the imggen invocations\nEOF`), []);
  assert.deepEqual(parseImggenCommand(`cat > gen.sh <<'EOF'\nimggen "fox" --name fox --seed 7\nEOF\necho done`), []);
  assert.deepEqual(parseImggenCommand(`cat <<-EOF > x\n\timggen "fox" --seed 7\n\tEOF`), []);
  assert.deepEqual(parseImggenCommand(`echo hi # imggen "fox" --seed 9`), []);
});

test("a heredoc body is skipped but the command after it still counts", () => {
  assert.deepEqual(parseImggenCommand(`cat > a <<EOF\nimggen no\nEOF\nimggen "yes" --name yes`).map((j) => j.slug), ["yes"]);
});

test("a # comment after the prompt hides the flags that follow it", () => {
  assert.equal(one(`imggen "fox" # --seed 9`).seeds, null);
});

test("commands argparse or imggen would reject yield no job", () => {
  assert.deepEqual(parseImggenCommand(`imggen --help`), []);
  assert.deepEqual(parseImggenCommand(`imggen`), []);
  assert.deepEqual(parseImggenCommand(`imggen "a" --name=Cat Pics`), [], "a second positional is an argparse error");
  assert.deepEqual(parseImggenCommand(`imggen x --bogus 1`), []);
  assert.deepEqual(parseImggenCommand(`imggen x --seed`), []);
  assert.deepEqual(parseImggenCommand(`imggen x --seed abc`), []);
  assert.deepEqual(parseImggenCommand(`imggen x -c 0`), [], "range(0) writes nothing");
});

test("names and seeds only the shell knows yield no job", () => {
  assert.deepEqual(parseImggenCommand(`imggen "$PROMPT" --seed 3`), []);
  assert.deepEqual(parseImggenCommand(`imggen "a fox" --name "$N"`), []);
  assert.deepEqual(parseImggenCommand(`imggen fox --seed $S`), []);
  assert.deepEqual(parseImggenCommand("imggen fox --name `date +%s`"), []);
  assert.equal(one(`imggen 'literal $PROMPT' --seed 3`).slug, "literal-prompt");
});

test("absurd counts are clamped", () => {
  assert.equal(one(`imggen x -c 500`).count, 16);
});

test("one command yields at most 8 jobs, so injected text can't fan out requests", () => {
  assert.equal(parseImggenCommand("imggen a --seed 1 -c 16;".repeat(10_000)).length, 8);
});

test("a seed range past what the lookup accepts falls back to time matching", () => {
  assert.equal(one(`imggen x --seed 9999999990 -c 16`).seeds, null);
  assert.deepEqual(one(`imggen x --seed 9999999998 -c 2`).seeds, [9999999998, 9999999999]);
});

test("tool args: only Bash, malformed JSON is not an error, oversized args are skipped", () => {
  const arg = JSON.stringify({ command: `imggen "a" --name a --seed 1`, description: "x" });
  assert.equal(imggenJobsFromToolArg("Bash", arg).length, 1);
  assert.deepEqual(imggenJobsFromToolArg("Read", arg), []);
  assert.deepEqual(imggenJobsFromToolArg("Bash", `{"command":"imggen a`), []);
  assert.deepEqual(imggenJobsFromToolArg("Bash", undefined), []);
  const big = JSON.stringify({ command: `imggen a --name a --seed 1 # ${"x".repeat(20_000)}` });
  assert.deepEqual(imggenJobsFromToolArg("Bash", big), []);
});

test("same-slug seedless jobs in one command take consecutive slices of the shared lookup", () => {
  const jobs = parseImggenCommand(`imggen "a" -c 3; imggen "b" -c 1; imggen "a" -c 2; imggen "a" --seed 9`);
  assert.deepEqual(jobs.map((j) => [j.slug, j.offset]), [["a", 0], ["b", 0], ["a", 3], ["a", 0]]);
});

test("an empty --name falls back to the prompt, like imggen's `a.name or a.prompt`", () => {
  assert.equal(one(`imggen "red fox" --name ""`).slug, "red-fox");
});
