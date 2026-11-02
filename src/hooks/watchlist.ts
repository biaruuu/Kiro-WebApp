import { useCallback, useSyncExternalStore } from 'react';

// "My List" — stored locally for now (a full page for it can come later).
const KEY = 'my-list';
const EVENT = 'my-list-change';

export interface ListItem {
  id: string;
  title: string;
  image: string;
  type?: string;
  year?: number | string | null;
  addedAt: number;
}

let cache: { raw: string | null; list: ListItem[] } = { raw: null, list: [] };

function readList(): ListItem[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return cache.list;
  }
  if (raw === cache.raw) return cache.list; // stable reference for useSyncExternalStore
  let list: ListItem[] = [];
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) list = parsed;
  } catch {
    /* ignore */
  }
  cache = { raw, list };
  return list;
}

function writeList(list: ListItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable — keep in-memory copy so the UI still reacts */
    cache = { raw: null, list };
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener('storage', cb);
  };
}

export function useMyList() {
  const list = useSyncExternalStore(subscribe, readList, () => []);

  const has = useCallback((id: string) => list.some((i) => i.id === String(id)), [list]);

  const toggle = useCallback((item: Omit<ListItem, 'addedAt'>) => {
    const current = readList();
    const id = String(item.id);
    if (current.some((i) => i.id === id)) {
      writeList(current.filter((i) => i.id !== id));
    } else {
      writeList([{ ...item, id, addedAt: Date.now() }, ...current]);
    }
  }, []);

  return { list, has, toggle };
}
