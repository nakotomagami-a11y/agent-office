import type { ImggenJob } from "./imggen-command";

// A backgrounded job outlives its turn; keep looking for about as long as it can take.
const BACKGROUND_MS_PER_IMAGE = 45_000;
const BACKGROUND_BASE_MS = 120_000;

export interface ImageJobWindow {
  /** Upper bound on the job's file mtimes; unset while a foreground call runs. */
  untilMs: number | undefined;
  /** Whether to keep polling. */
  live: boolean;
  /** When a backgrounded job's budget runs out; unset for a foreground job. */
  deadline: number | undefined;
}

/**
 * A foreground job is over once its call returns (`doneTs`). A backgrounded one
 * runs on past that, so its budget counts from the return: the CLI may background
 * a call only after a long timeout, by which point a budget from `ts` is spent.
 */
export function imageJobWindow(job: ImggenJob, ts: number, doneTs: number | undefined, turnLive: boolean, now: number): ImageJobWindow {
  if (!job.background) return { untilMs: doneTs, live: turnLive && doneTs === undefined, deadline: undefined };
  const deadline = (doneTs ?? ts) + BACKGROUND_BASE_MS + job.count * BACKGROUND_MS_PER_IMAGE;
  return { untilMs: deadline, live: turnLive || now < deadline, deadline };
}
