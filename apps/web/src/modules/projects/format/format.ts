// Pure presentation helpers for the projects module.

export function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60_000);
  if (m < 2) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

export function shortenCwd(cwd: string): { prefix: string } {
  // Replace /home/<user>/ with ~/
  const tilde = cwd.replace(/^\/home\/[^/]+\//, "~/");
  const slash = tilde.lastIndexOf("/");
  return { prefix: slash > 0 ? tilde.slice(0, slash + 1) : tilde };
}
