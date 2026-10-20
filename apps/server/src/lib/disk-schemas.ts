// Shapes of files the server reads from disk, not wire payloads: those live in @agent-office/api-contract.
import { z } from "zod";

// RULE arch.parse-dont-cast: a malformed value here is reachable without any code change.

const docsTabSchema = z.object({ id: z.string(), label: z.string(), file: z.string() });

export const docsIndexSchema = z.object({
  version: z.number().default(0),
  // One bad tab must not blank the whole panel, so entries are DROPPED.
  tabs: z.array(z.unknown()).default([]).transform((tabs) =>
    tabs.flatMap((t) => {
      const parsed = docsTabSchema.safeParse(t);
      return parsed.success ? [parsed.data] : [];
    }),
  ),
});

export const starterManifestSchema = z.object({
  version: z.string(),
  agents: z.array(z.object({ file: z.string(), name: z.string(), description: z.string().default(""), hash: z.string() })),
}).passthrough();

export const starterSkipStateSchema = z.object({
  version: z.string(),
  slugs: z.array(z.string()),
}).passthrough();

/** The bundle hash each starter agent was installed from, and the ones the user turned down. */
export const agentInstallRecordSchema = z.object({
  agents: z.record(z.string(), z.string()).default({}),
  declined: z.array(z.string()).default([]),
}).passthrough();
