// Image URLs an image-job card is currently displaying, per chat thread. The
// agent's closing message pastes the same paths; its thumbnail strip hides only
// URLs listed here, so an image is never hidden unless a card really shows it.

export interface ShownImages {
  add(urls: string[]): void;
  remove(urls: string[]): void;
  has(url: string): boolean;
  subscribe(onChange: () => void): () => void;
  /** Bumps on every change — the useSyncExternalStore snapshot. */
  version(): number;
}

export function createShownImages(): ShownImages {
  const counts = new Map<string, number>();
  const listeners = new Set<() => void>();
  let version = 0;
  const changed = () => {
    version++;
    listeners.forEach((l) => l());
  };
  return {
    add(urls) {
      if (urls.length === 0) return;
      urls.forEach((u) => counts.set(u, (counts.get(u) ?? 0) + 1));
      changed();
    },
    remove(urls) {
      if (urls.length === 0) return;
      urls.forEach((u) => {
        const n = (counts.get(u) ?? 0) - 1;
        if (n > 0) counts.set(u, n);
        else counts.delete(u);
      });
      changed();
    },
    has: (url) => counts.has(url),
    subscribe(onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    version: () => version,
  };
}
