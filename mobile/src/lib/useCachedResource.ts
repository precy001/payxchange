import { useCallback, useEffect, useRef, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { cache } from './cache';

// Stale-while-revalidate: returns cached data immediately (no loading flash),
// and silently refreshes in the background when the data is older than maxAgeMs
// or when the screen regains focus. Multiple screens sharing a key stay in sync.
export function useCachedResource<T>(
  key: string,
  fetcher: () => Promise<T>,
  opts?: { maxAgeMs?: number },
) {
  const maxAgeMs = opts?.maxAgeMs ?? 30_000;
  const focused = useIsFocused();

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const initial = cache.get(key);
  const [data, setData] = useState<T | undefined>(initial?.value);
  const [loading, setLoading] = useState(!initial);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (background: boolean) => {
      if (background) setRefreshing(true);
      else setLoading(true);
      try {
        const value = await fetcherRef.current();
        cache.set(key, value);
        setData(value);
      } catch {
        // keep whatever we already have
      } finally {
        if (background) setRefreshing(false);
        else setLoading(false);
      }
    },
    [key],
  );

  // Keep in sync if another screen updates the same key.
  useEffect(() => {
    const unsub = cache.subscribe(key, () => {
      const c = cache.get(key);
      if (c) setData(c.value);
    });
    return unsub;
  }, [key]);

  // On focus (and key change): show cache instantly, revalidate if stale/missing.
  useEffect(() => {
    if (!focused) return;
    const c = cache.get(key);
    if (!c) {
      load(false);
    } else {
      setData(c.value);
      setLoading(false);
      if (Date.now() - c.at > maxAgeMs) load(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused, key]);

  return { data, loading, refreshing, refresh: () => load(true) };
}