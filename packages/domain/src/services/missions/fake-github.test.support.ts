// One GitHub repo shared by several simulated devices: answers exactly the gh calls missions make
// (hub.ts), and fails loudly on any other, so a new call cannot pass a test by accident.
import { z } from "zod";
import { ReviewError, type GhCall, type GhRunner } from "../review/gh";

interface FakeComment {
  id: number;
  author: string;
  body: string;
  created_at: string;
  updated_at: string;
}

interface FakePull {
  title: string;
  body: string;
  head: string;
  state: string;
}

export class FakeGitHub {
  readonly comments: FakeComment[] = [];
  readonly pulls = new Map<number, FakePull>();
  readonly branches = new Set(["main"]);
  readonly calls: string[][] = [];
  /** Commits that exist only on some device, never pushed. */
  readonly unpushed = new Set<string>();
  /** The next N comment POSTs fail, as a gh timeout would. */
  failPosts = 0;
  login = "chaosandcurves";
  private nextComment = 1000;
  private nextPull = 690;
  private clock = Date.parse("2026-10-15T10:00:00Z");

  readonly runner: GhRunner = async (call: GhCall) => this.handle(call.args, call.input);

  /** A comment as another device (or a stranger) would post it, outside the code under test. */
  addComment(body: string, author = this.login): number {
    this.clock += 1000;
    const at = new Date(this.clock).toISOString();
    const c = { id: this.nextComment++, author, body, created_at: at, updated_at: at };
    this.comments.push(c);
    return c.id;
  }

  private handle(args: string[], input?: string): string {
    this.calls.push(args);
    const [cmd, sub] = args;
    if (cmd === "repo" && sub === "view") return "main\n";
    if (cmd === "label") return "";
    if (cmd === "pr" && sub === "create") return this.createPull(args, input ?? "");
    if (cmd === "pr" && sub === "view") return this.viewPull(Number(args[2]));
    if (cmd === "pr" && sub === "close") {
      const p = this.pulls.get(Number(args[2]));
      if (!p) throw new ReviewError("pr_not_found", `no pull ${args[2]}`);
      p.state = "CLOSED";
      if (args.includes("--delete-branch")) this.branches.delete(p.head);
      return "";
    }
    if (cmd === "pr" && sub === "list") {
      const open = [...this.pulls.entries()].filter(([, p]) => p.state === "OPEN");
      return JSON.stringify(open.map(([n]) => JSON.parse(this.viewPull(n)) as unknown));
    }
    if (cmd === "api") return this.api(args, input);
    throw new Error(`fake gh: unhandled ${args.join(" ")}`);
  }

  private createPull(args: string[], body: string): string {
    const n = this.nextPull++;
    const at = (flag: string) => args[args.indexOf(flag) + 1] ?? "";
    this.pulls.set(n, { title: at("--title"), body, head: at("--head"), state: "OPEN" });
    return `Creating draft pull request\nhttps://github.com/owner/repo/pull/${n}\n`;
  }

  private viewPull(n: number): string {
    const p = this.pulls.get(n);
    if (!p) throw new ReviewError("pr_not_found", `no pull ${n}`);
    return JSON.stringify({ number: n, title: p.title, url: `https://github.com/owner/repo/pull/${n}`, headRefName: p.head, isDraft: true, body: p.body, state: p.state });
  }

  private api(args: string[], input?: string): string {
    const path = args.find((a) => a.startsWith("repos/") || a === "user") ?? "";
    const method = args.includes("--method") ? args[args.indexOf("--method") + 1] : "GET";
    const body = input ? z.record(z.string(), z.string()).parse(JSON.parse(input)) : {};
    if (path === "user") return `${this.login}\n`;
    let m = /\/git\/ref\/heads\/(.+)$/.exec(path);
    if (m) {
      if (!this.branches.has(m[1] ?? "")) throw new ReviewError("gh_failed", "gh: Not Found (HTTP 404)");
      return "f00d\n";
    }
    if (path.endsWith("/git/refs") && method === "POST") {
      this.branches.add((body.ref ?? "").replace("refs/heads/", ""));
      return "{}";
    }
    if (path.includes("/contents/") && method === "PUT") return "{}";
    m = /\/issues\/(\d+)\/comments(\?.*)?$/.exec(path);
    if (m && method === "POST" && this.failPosts > 0) {
      this.failPosts--;
      throw new ReviewError("gh_failed", "timed out after 60s");
    }
    if (m && method === "POST") {
      const id = this.addComment(body.body ?? "");
      return JSON.stringify({ id, created_at: this.comments.at(-1)?.created_at });
    }
    if (m) {
      const since = new URLSearchParams((m[2] ?? "").slice(1)).get("since");
      return this.comments
        .filter((c) => !since || c.created_at >= since)
        .map((c) => JSON.stringify({ id: c.id, author: c.author, body: c.body, at: c.created_at, updated: c.updated_at }))
        .join("\n");
    }
    m = /\/issues\/comments\/(\d+)$/.exec(path);
    if (m && method === "PATCH") {
      const c = this.comments.find((x) => x.id === Number(m?.[1]));
      if (!c) throw new ReviewError("gh_failed", "Not Found (HTTP 404)");
      c.body = body.body ?? "";
      this.clock += 1000;
      c.updated_at = new Date(this.clock).toISOString();
      return "{}";
    }
    m = /\/commits\/([0-9a-f]+)$/.exec(path);
    if (m) {
      if (this.unpushed.has(m[1] ?? "")) throw new ReviewError("gh_failed", "No commit found for SHA (HTTP 422)");
      return "abc\n";
    }
    throw new Error(`fake gh: unhandled api ${method} ${path}`);
  }
}
