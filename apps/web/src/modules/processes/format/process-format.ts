// Pure helpers for the processes modal: formatting, framework/proto detection,
// and project grouping. No React.

import type { ProcessInfo } from "../hooks/use-processes";

export function fmtMem(mb: number): string {
  if (mb === 0) return "-";
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
}

export function fmtUptime(startedAt: number): string {
  if (!startedAt) return "-";
  const ms = Math.max(0, Date.now() - startedAt);
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

export function fmtAgo(startedAt: number): string {
  if (!startedAt) return "-";
  const ms = Math.max(0, Date.now() - startedAt);
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function detectFramework(name: string, cmd: string): string {
  const c = cmd.toLowerCase();
  const n = name.toLowerCase();
  if (c.includes("next") || n === "next-server") return "Next.js";
  if (n === "bun" || c.startsWith("bun ")) return "Bun";
  if (n === "node" || c.includes("node ")) return "Node.js";
  if (n === "python" || n === "python3") return "Python";
  if (n === "ruby") return "Ruby";
  if (n === "java") return "Java";
  if (n === "go") return "Go";
  if (n === "redis-server") return "Redis";
  if (n === "postgres" || n === "postgresql") return "PostgreSQL";
  if (n === "nginx") return "nginx";
  if (n === "caddy") return "Caddy";
  if (n === "dockerd") return "Docker daemon";
  return name;
}

export function detectProto(name: string, cmd: string): string {
  const n = name.toLowerCase();
  const c = cmd.toLowerCase();
  if (
    n === "next-server" || c.includes("next") ||
    n === "bun" || c.startsWith("bun ") ||
    n === "node" || c.includes("node ") ||
    n === "python" || n === "python3" ||
    n === "ruby" || n === "deno" ||
    c.includes("vite") || c.includes("webpack") ||
    n === "caddy" || n === "nginx"
  ) return "http";
  return "tcp";
}

export type ProcessGroup = { id: string; label: string; processes: ProcessInfo[] };

export function groupByProject(processes: ProcessInfo[]): ProcessGroup[] {
  const map = new Map<string, ProcessGroup>();
  for (const p of processes) {
    const key = p.projectId ?? "__other__";
    const label = p.projectName ?? "Other";
    if (!map.has(key)) map.set(key, { id: key, label, processes: [] });
    map.get(key)!.processes.push(p);
  }
  const groups = Array.from(map.values());
  return [
    ...groups.filter((g) => g.label !== "Other").sort((a, b) => a.label.localeCompare(b.label)),
    ...groups.filter((g) => g.label === "Other"),
  ];
}
