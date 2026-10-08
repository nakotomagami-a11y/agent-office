// SVG is excluded: served inline from the app's own origin it can run script.
export const GENERATED_IMAGE_EXT = /\.(png|jpe?g|webp|gif)$/i;
export const GENERATED_IMAGE_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** imggen's filename slug: lowercase, `[a-z0-9-]`, at most 40 chars. */
export const GENERATED_IMAGE_SLUG = /^[a-z0-9-]{1,40}$/;
/** imggen's own `--count` limit (1..8). */
export const MAX_IMAGES_PER_JOB = 8;
/** imggen accepts `--seed` 0..2**32 - count, so the last image's seed is at most this. */
export const MAX_SEED = 2 ** 32 - 1;
/** One command may hold several same-slug seedless jobs that share a lookup. */
export const MAX_JOBS_PER_COMMAND = 8;

export interface GeneratedImageRef {
  seed: number;
  date: string;
  filename: string;
}

/** Same rule as imggen's `re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:40] or "image"`. */
export function imggenSlug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "image";
}
