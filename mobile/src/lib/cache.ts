// A tiny shared cache so screens can show data instantly instead of refetching
// (and blanking to skeletons) every time they gain focus. In-memory: it lives
// as long as the JS context does, which covers tab switches and quick returns
// to the app. Cleared on logout.

type Entry = { value: any; at: number };

const store = new Map<string, Entry>();
const subs = new Map<string, Set<() => void>>();

export const cache = {
  get(key: string): Entry | undefined {
    return store.get(key);
  },
  set(key: string, value: any) {
    store.set(key, { value, at: Date.now() });
    subs.get(key)?.forEach((fn) => fn());
  },
  subscribe(key: string, fn: () => void): () => void {
    if (!subs.has(key)) subs.set(key, new Set());
    subs.get(key)!.add(fn);
    return () => {
      subs.get(key)?.delete(fn);
    };
  },
  clear() {
    store.clear();
  },
};