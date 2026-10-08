// GET /api/generated-images?name=<slug>&since=<epoch-ms>[&seeds=1,2,3] — which
// images of one imggen job exist so far. Polled by the chat's image-job card.
import { generatedImages } from "@agent-office/domain/services";
import { tryService } from "@/lib/api-helpers";
import { validateQuery } from "@/lib/validation";
import { generatedImagesQuerySchema } from "@/lib/validation-schemas";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { data, error } = validateQuery(generatedImagesQuerySchema, new URL(request.url).searchParams);
  if (error) return error;
  return tryService(() => ({
    images: generatedImages.findGeneratedImages({
      slug: data.name,
      sinceMs: data.since,
      seeds: data.seeds ? data.seeds.split(",").map(Number) : null,
    }),
  }));
}
