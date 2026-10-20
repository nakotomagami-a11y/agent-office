import { z } from "zod";
import { normalizeBaseUrl, PROVIDERS } from "@agent-office/domain/config/providers";

export const providerIdSchema = z.enum(PROVIDERS);

/** http(s) only, no userinfo, query or fragment: the same rule the server binds a key with. */
export const providerBaseUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .refine((v) => normalizeBaseUrl(v) !== null, { message: "base_url_invalid" });

const modelIdSchema = z.string().trim().min(1).max(200);

export const providerModelsSchema = z
  .object({ haiku: modelIdSchema, sonnet: modelIdSchema, opus: modelIdSchema })
  .partial()
  .strict();

/** PUT /api/providers/:id. A blank or absent `apiKey` keeps the stored key, unless the URL changes. */
export const providerConfigPutSchema = z
  .object({
    baseUrl: providerBaseUrlSchema.nullable().optional(),
    apiKey: z.string().trim().max(1000).optional(),
    models: providerModelsSchema.optional(),
  })
  .strict();

export const providerSelectedPutSchema = z.object({
  provider: providerIdSchema,
  acceptUnavailable: z.boolean().optional(),
});

/** POST /api/providers/:id/test. No draft: test the stored config. */
export const providerTestSchema = z.object({ draft: providerConfigPutSchema.optional() });

export const modelPriceSchema = z.object({
  provider: z.enum(["openai", "anthropic"]),
  inputPerMTok: z.number().nonnegative(),
  outputPerMTok: z.number().nonnegative(),
  cacheReadPerMTok: z.number().nonnegative().optional(),
  cacheWritePerMTok: z.number().nonnegative().optional(),
});

/** GET /api/model-prices. */
export const modelPricesResponseSchema = z.object({
  source: z.enum(["litellm", "openrouter"]).nullable(),
  fetchedAt: z.number().nullable(),
  stale: z.boolean(),
  entries: z.record(z.string(), modelPriceSchema),
});
