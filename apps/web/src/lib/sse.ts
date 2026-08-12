export interface SseWriter {
  write: (event: string, data: unknown) => Promise<void>;
  writeRaw: (frame: string) => Promise<void>;
  close: () => Promise<void>;
  readonly closed: boolean;
}

export function createSseStream(): { stream: ReadableStream<Uint8Array>; writer: SseWriter } {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
    cancel() {
      closed = true;
    },
  });

  const writer: SseWriter = {
    get closed() {
      return closed;
    },
    async write(event, data) {
      if (closed) return;
      const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      controller.enqueue(encoder.encode(payload));
    },
    async writeRaw(frame) {
      if (closed) return;
      controller.enqueue(encoder.encode(frame));
    },
    async close() {
      if (closed) return;
      closed = true;
      try {
        controller.close();
      } catch {
        /* already closed */
      }
    },
  };

  return { stream, writer };
}

export const SSE_HEADERS: HeadersInit = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};
