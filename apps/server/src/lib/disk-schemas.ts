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
  agents: z.array(z.unknown()),
}).passthrough();

export const starterSkipStateSchema = z.object({
  version: z.string(),
  slugs: z.array(z.string()),
}).passthrough();
