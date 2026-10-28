/** Bodies from servers the user picked are read under a cap, never whole. */
export const MAX_UPSTREAM_BODY_BYTES = 2 * 1024 * 1024;

/** `complete: false` when the cap cut it short (the rest was cancelled, not buffered). */
export async function readCapped(res: Response, maxBytes = MAX_UPSTREAM_BODY_BYTES): Promise<{ text: string; complete: boolean }> {
  const reader = res.body?.getReader();
  if (!reader) return { text: "", complete: true };
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return { text: Buffer.concat(chunks).toString("utf8"), complete: false };
      }
      chunks.push(value);
    }
  } catch {
    return { text: Buffer.concat(chunks).toString("utf8"), complete: false };
  }
  return { text: Buffer.concat(chunks).toString("utf8"), complete: true };
}
