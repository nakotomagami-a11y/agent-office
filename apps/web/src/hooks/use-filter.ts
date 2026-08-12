import { useMemo, useState } from "react";

export function useFilter<T>(
  items: T[],
  predicate: (item: T, query: string) => boolean,
) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return items;
    return items.filter((item) => predicate(item, q));
    // predicate is a pure inline function - intentionally excluded from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, query]);
  return { query, setQuery, filtered };
}
