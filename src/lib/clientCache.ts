"use client";

// localStorage solo acelera el primer pintado; el servidor es la fuente de verdad.
const KEY = "__gestorHorarioCache";
const STALE_KEY = "__gestorHorarioStale";
const FETCHED_AT_KEY = "__gestorHorarioFetchedAt";
const LS_PREFIX = "__agc:";

/** Edad máxima de caché antes de refetch al volver a la pestaña (ms). */
export const CACHE_MAX_AGE_MS = 2 * 60 * 1000;

type CacheShape = Record<string, unknown>;
type FetchedAtShape = Record<string, number>;

function store(): CacheShape {
  if (typeof window === "undefined") return {};
  const w = window as unknown as { [KEY]?: CacheShape };
  w[KEY] ??= {};
  return w[KEY];
}

function fetchedAtStore(): FetchedAtShape {
  if (typeof window === "undefined") return {};
  const w = window as unknown as { [FETCHED_AT_KEY]?: FetchedAtShape };
  w[FETCHED_AT_KEY] ??= {};
  return w[FETCHED_AT_KEY];
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
  delete fetchedAtStore()[key];
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
            delete fetchedAtStore()[k];
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
      delete fetchedAtStore()[ev.key.slice(LS_PREFIX.length)];
    }
  });
}

function peek<T>(key: string): T | null {
  const v = store()[key];
  return v === undefined ? null : (v as T);
}

export function put(key: string, data: unknown) {
  store()[key] = data;
  fetchedAtStore()[key] = Date.now();
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
  if (mem !== null) {
    if (!fetchedAtStore()[key]) fetchedAtStore()[key] = Date.now();
    return mem;
  }
  const persisted = peekSession<T>(key);
  if (persisted !== null) {
    store()[key] = persisted;
    if (!fetchedAtStore()[key]) fetchedAtStore()[key] = Date.now();
  }
  return persisted;
}

/** True si hay caché usable (no invalidada). */
export function hasFresh(key: string): boolean {
  return warmData(key) !== null;
}

/** True si todas las keys tienen caché usable. */
export function hasFreshAll(keys: readonly string[]): boolean {
  return keys.every((key) => hasFresh(key));
}

/** Timestamp del último put en memoria (0 si no hay). */
export function fetchedAt(key: string): number {
  return fetchedAtStore()[key] ?? 0;
}

/** True si alguna key falta, está stale, o el fetch más reciente supera maxAgeMs. */
export function needsRefresh(
  keys: readonly string[],
  maxAgeMs: number = CACHE_MAX_AGE_MS,
): boolean {
  if (!hasFreshAll(keys)) return true;
  const now = Date.now();
  let newest = 0;
  for (const key of keys) {
    newest = Math.max(newest, fetchedAt(key));
  }
  if (newest === 0) return true;
  return now - newest > maxAgeMs;
}

/** Fetch + put de un endpoint si falta o force. Devuelve los datos. */
export async function revalidate<T = unknown>(
  url: string,
  opts: { force?: boolean } = {},
): Promise<T | null> {
  if (!opts.force && hasFresh(url)) {
    return warmData<T>(url);
  }
  try {
    const data = (await fetch(url).then((r) => r.json())) as T;
    put(url, data);
    return data;
  } catch {
    return warmData<T>(url);
  }
}

/** Prefetch en background solo si la key no está fresca. */
export function prefetchEndpoints(urls: readonly string[]) {
  if (typeof window === "undefined") return;
  for (const url of urls) {
    if (hasFresh(url)) continue;
    fetch(url)
      .then((r) => r.json())
      .then((d) => put(url, d))
      .catch(() => {});
  }
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
  "/api/subject_grade_durations",
  "/api/slot_requests",
  "/api/assignments",
  "/api/availabilities",
  "/api/teacher_blocks",
] as const;

export const DASHBOARD_ENDPOINTS = [
  "/api/teachers",
  "/api/subjects",
  "/api/assignments",
  "/api/teacher_blocks",
  "/api/availabilities",
  "/api/students",
  "/api/subject_students",
] as const;

export const STUDENTS_ENDPOINTS = [
  "/api/students",
  "/api/subjects",
  "/api/subject_students",
  "/api/availabilities",
  "/api/teacher_blocks",
  "/api/assignments",
  "/api/teachers",
] as const;

export const SUBJECTS_ENDPOINTS = ["/api/subjects"] as const;

export const REQUESTS_ENDPOINTS = [
  "/api/subjects",
  "/api/subject_students",
  "/api/slot_requests",
  "/api/students",
  "/api/availabilities",
] as const;

/** Endpoints a prefetch según ruta de navegación. */
export const ROUTE_PREFETCH: Record<string, readonly string[]> = {
  "/dashboard": DASHBOARD_ENDPOINTS,
  "/students": STUDENTS_ENDPOINTS,
  "/subjects": SUBJECTS_ENDPOINTS,
  "/requests": REQUESTS_ENDPOINTS,
};

export function prefetchRoute(href: string) {
  const urls = ROUTE_PREFETCH[href];
  if (!urls) return;
  prefetchEndpoints(urls);
}

export function prefetchAll(opts: { delayMs?: number; skip?: readonly string[] } = {}) {
  if (typeof window === "undefined") return;
  const w = window as unknown as { __gestorHorarioWarm?: boolean };
  if (w.__gestorHorarioWarm) return;
  w.__gestorHorarioWarm = true;

  const skip = new Set(opts.skip ?? []);
  const run = () => {
    for (const url of WARM_ENDPOINTS) {
      if (skip.has(url)) continue;
      if (warmData(url) !== null) continue;
      fetch(url)
        .then((r) => r.json())
        .then((d) => put(url, d))
        .catch(() => {});
    }
  };

  const delayMs = opts.delayMs ?? 400;
  const ric = (
    window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    }
  ).requestIdleCallback;

  if (typeof ric === "function") {
    window.setTimeout(() => {
      ric(run, { timeout: 2000 });
    }, delayMs);
  } else {
    window.setTimeout(run, delayMs);
  }
}
