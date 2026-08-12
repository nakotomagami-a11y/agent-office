import { useState, useEffect } from "react";

/** Forces a re-render every `ms` while `active`, so relative-time labels
 *  (elapsed timers) stay current without owning any real state. */
export function useIntervalTick(active: boolean, ms = 1000): void {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => tick((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [active, ms]);
}
