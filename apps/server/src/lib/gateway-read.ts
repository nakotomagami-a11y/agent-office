/** An upstream body read under a cap: error bodies come from servers the user picked. */
export async function readCapped(res: Response, maxBytes = 64 * 1024): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let text = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
      if (text.length > maxBytes) {
        await reader.cancel();
        return text.slice(0, maxBytes);
      }
    }
  } catch {
    return text;
  }
  return text;
}
