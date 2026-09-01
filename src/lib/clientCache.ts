"use client";

// Cache en memoria + localStorage (persistente en el dispositivo): las paginas
// pintan al instante desde cache y SOLO refetchean tras una mutacion.
const KEY = "__agendaCache";
const MUT_KEY = "__agendaMut";

type CacheShape = Record<string, unknown>;

function store(): CacheShape {
  if (typeof window === "undefined") return {};
  const w = window as unknown as { [KEY]?: CacheShape };
  w[KEY] ??= {};
  return w[KEY];
}

function mutations(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(MUT_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function markMutation(key: string) {
  if (typeof window === "undefined") return;
  try {
    const m = mutations();
    m.add(key);
    localStorage.setItem(MUT_KEY, JSON.stringify([...m]));
  } catch {}
}

function clearMutation(key: string) {
  if (typeof window === "undefined") return;
  try {
    const m = mutations();
    m.delete(key);
    localStorage.setItem(MUT_KEY, JSON.stringify([...m]));
  } catch {}
}

export function peek<T>(key: string): T | null {
  const v = store()[key];
  return v === undefined ? null : (v as T);
}

export function put(key: string, data: unknown) {
  store()[key] = data;
  // persistir EN EL DISPOSITIVO: localStorage sobrevive a cerrar y reabrir la app
  try {
    localStorage.setItem(`__agc:${key}`, JSON.stringify(data));
  } catch {}
}

/** Datos guardados en el DISPOSITIVO (localStorage, sobrevive a cerrar la app). */
export function peekSession<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`__agc:${key}`);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function fetchJSON<T>(key: string, url: string): Promise<T> {
  const res = await fetch(url);
  const data = (await res.json()) as T;
  put(key, data);
  return data;
}

/**
 * Datos para pintar al instante: cache de sesion si existe y no hubo mutacion.
 * Si hubo mutacion (crear/editar/borrar) devuelve null para forzar refresco real.
 */
/** Datos guardados en el dispositivo: pintan al instante. */
export function warmData<T>(key: string): T | null {
  if (mutations().has(key)) {
    clearMutation(key);
    return null;
  }
  const mem = peek<T>(key);
  if (mem !== null) return mem;
  return peekSession<T>(key);
}

/** Llamar DESPUES de cualquier POST/PUT/PATCH/DELETE sobre un endpoint cacheado. */
export function invalidate(key: string) {
  markMutation(key);
}

/** Invalida varias claves de cache tras una mutacion. */
export function invalidateMany(keys: string[]) {
  for (const key of keys) invalidate(key);
}

export const WARM_ENDPOINTS: [string, string][] = [
  ["teachers", "/api/teachers"],
  ["subjects", "/api/subjects"],
  ["students", "/api/students"],
  ["subject_students", "/api/subject_students"],
  ["slot_requests", "/api/slot_requests"],
  ["assignments", "/api/assignments"],
  ["availabilities", "/api/availabilities"],
];

export function prefetchAll() {
  if (typeof window === "undefined") return;
  const w = window as unknown as { __agendaWarm?: boolean };
  if (w.__agendaWarm) return;
  w.__agendaWarm = true;
  for (const [key, url] of WARM_ENDPOINTS) {
    fetch(url)
      .then((r) => r.json())
      .then((d) => put(key, d))
      .catch(() => {});
  }
}