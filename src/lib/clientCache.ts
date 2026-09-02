"use client";

// localStorage solo acelera el primer pintado; el servidor es la fuente de verdad.
const KEY = "__gestorHorarioCache";
const STALE_KEY = "__gestorHorarioStale";
const LS_PREFIX = "__agc:";

type CacheShape = Record<string, unknown>;

function store(): CacheShape {
  if (typeof window === "undefined") return {};
  const w = window as unknown as { [KEY]?: CacheShape };
  w[KEY] ??= {};
  return w[KEY];
}

let staleCache: Set<string> | null = null;

function staleKeys(): Set<string> {
  if (typeof window === "undefined") return new Set();
  if (staleCache) return staleCache;
  try {
    const raw = localStorage.getItem(STALE_KEY);
    staleCache = new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    staleCache = new Set();
  }
  return staleCache;
}

function persistStale(keys: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STALE_KEY, JSON.stringify([...keys]));
  } catch {}
}

function removePersisted(key: string) {
  try {
    localStorage.removeItem(`${LS_PREFIX}${key}`);
  } catch {}
}

function markStale(key: string) {
  delete store()[key];
  removePersisted(key);
  const s = staleKeys();
  s.add(key);
  persistStale(s);
}

function clearStale(key: string) {
  const s = staleKeys();
  if (!s.delete(key)) return;
  persistStale(s);
}

if (typeof window !== "undefined") {
  try {
    const legacy = localStorage.getItem("__gestorHorarioMut");
    if (legacy) {
      localStorage.removeItem("__gestorHorarioMut");
      const s = staleKeys();
      for (const k of JSON.parse(legacy) as string[]) s.add(k);
      persistStale(s);
    }
  } catch {}

  window.addEventListener("storage", (ev) => {
    if (ev.key === STALE_KEY) {
      staleCache = null;
      if (ev.newValue) {
        try {
          for (const k of JSON.parse(ev.newValue) as string[]) {
            delete store()[k];
          }
        } catch {}
      }
      return;
    }
    if (ev.key?.startsWith(LS_PREFIX) && ev.newValue != null) {
      const cacheKey = ev.key.slice(LS_PREFIX.length);
      if (staleKeys().has(cacheKey)) return;
      try {
        store()[cacheKey] = JSON.parse(ev.newValue);
      } catch {}
    }
    if (ev.key?.startsWith(LS_PREFIX) && ev.newValue == null) {
      delete store()[ev.key.slice(LS_PREFIX.length)];
    }
  });
}

export function peek<T>(key: string): T | null {
  const v = store()[key];
  return v === undefined ? null : (v as T);
}

export function put(key: string, data: unknown) {
  store()[key] = data;
  clearStale(key);
  try {
    localStorage.setItem(`${LS_PREFIX}${key}`, JSON.stringify(data));
  } catch {}
}

function peekSession<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`${LS_PREFIX}${key}`);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** Cache válida para pintar al instante. Usar en useEffect, no en useState inicial. */
export function warmData<T>(key: string): T | null {
  if (staleKeys().has(key)) return null;
  const mem = peek<T>(key);
  if (mem !== null) return mem;
  const persisted = peekSession<T>(key);
  if (persisted !== null) store()[key] = persisted;
  return persisted;
}

/** Borra cache obsoleta; llamar antes de refetch tras mutación. */
export function invalidate(key: string) {
  markStale(key);
}

export function invalidateMany(keys: string[]) {
  for (const key of keys) invalidate(key);
}

export const WARM_ENDPOINTS = [
  "/api/teachers",
  "/api/subjects",
  "/api/students",
  "/api/subject_students",
  "/api/slot_requests",
  "/api/assignments",
  "/api/availabilities",
  "/api/teacher_blocks",
] as const;

export function prefetchAll() {
  if (typeof window === "undefined") return;
  const w = window as unknown as { __gestorHorarioWarm?: boolean };
  if (w.__gestorHorarioWarm) return;
  w.__gestorHorarioWarm = true;
  for (const url of WARM_ENDPOINTS) {
    if (warmData(url) !== null) continue;
    fetch(url)
      .then((r) => r.json())
      .then((d) => put(url, d))
      .catch(() => {});
  }
}
