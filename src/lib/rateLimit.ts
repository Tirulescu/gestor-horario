import { type NextRequest } from "next/server";

/** Límite de body para rutas /api (comprobado en proxy antes del handler). */
export const MAX_API_BODY_BYTES = 256 * 1024;

const WINDOWS = {
  default: { limit: 120, windowMs: 60_000 },
  expensive: { limit: 8, windowMs: 60_000 },
  auth: { limit: 30, windowMs: 60_000 },
} as const;

type WindowKey = keyof typeof WINDOWS;

type Bucket = { count: number; resetAt: number };

const ipStore = new Map<string, Bucket>();
const userStore = new Map<string, Bucket>();
let lastPrune = Date.now();

function pruneStore(now: number) {
  if (now - lastPrune < 60_000) return;
  lastPrune = now;
  for (const [key, bucket] of ipStore) {
    if (bucket.resetAt <= now) ipStore.delete(key);
  }
  for (const [key, bucket] of userStore) {
    if (bucket.resetAt <= now) userStore.delete(key);
  }
}

/**
 * Obtiene la IP del cliente de forma resistente a spoofing.
 *
 * Prioridad: headers que solo el hosting puede establecer, luego el último
 * valor de X-Forwarded-For (el añadido por el reverse proxy de confianza
 * más cercano), y por último X-Real-Ip.
 */
export function getClientIp(request: NextRequest): string {
  // Headers inyectados por el proveedor de hosting (no spoofeable por el cliente)
  const vercel = request.headers.get("x-vercel-forwarded-for");
  if (vercel) {
    const first = vercel.split(",")[0]?.trim();
    if (first) return first;
  }
  const cf = request.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const flyClient = request.headers.get("fly-client-ip");
  if (flyClient) return flyClient.trim();

  // Fallback: último valor de X-Forwarded-For (el que añade el proxy más
  // cercano al servidor, no el que envía el cliente).
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }

  return request.headers.get("x-real-ip") ?? "unknown";
}

function windowKey(request: NextRequest): WindowKey {
  const { pathname } = request.nextUrl;
  const method = request.method.toUpperCase();

  if (pathname.startsWith("/auth/")) return "auth";
  if (
    (pathname === "/api/auto_schedule" || pathname === "/api/subject_grade_durations") &&
    method === "POST"
  ) {
    return "expensive";
  }
  return "default";
}

function hitBucket(store: Map<string, Bucket>, key: string, cfg: { limit: number; windowMs: number }, now: number): boolean {
  let bucket = store.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + cfg.windowMs };
    store.set(key, bucket);
  }
  bucket.count += 1;
  return bucket.count > cfg.limit;
}

function retryAfterMs(store: Map<string, Bucket>, key: string, now: number): number {
  const bucket = store.get(key);
  if (!bucket) return 1;
  return Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
}

/**
 * Doble rate limit: por IP (contra abuso anónimo) y por usuario autenticado
 * (contra spoofing de IP con sesión válida).
 */
export function checkRateLimit(
  request: NextRequest,
  userId?: string,
): { ok: true } | { ok: false; retryAfter: number } {
  if (!request.nextUrl.pathname.startsWith("/api/") && !request.nextUrl.pathname.startsWith("/auth/")) {
    return { ok: true };
  }

  const now = Date.now();
  pruneStore(now);

  const wk = windowKey(request);
  const cfg = WINDOWS[wk];
  const ip = getClientIp(request);
  const ipKey = `${wk}:ip:${ip}:${request.nextUrl.pathname}`;

  if (hitBucket(ipStore, ipKey, cfg, now)) {
    return { ok: false, retryAfter: retryAfterMs(ipStore, ipKey, now) };
  }

  // Segundo límite por usuario autenticado (imposible de spoof sin robar sesión)
  if (userId) {
    const userKey = `${wk}:user:${userId}:${request.nextUrl.pathname}`;
    if (hitBucket(userStore, userKey, cfg, now)) {
      return { ok: false, retryAfter: retryAfterMs(userStore, userKey, now) };
    }
  }

  return { ok: true };
}

/** Mutaciones solo desde el mismo host (mitiga CSRF cross-origin con cookies de sesión). */
export function isAllowedMutationOrigin(request: NextRequest): boolean {
  const method = request.method.toUpperCase();
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) return true;
  if (!request.nextUrl.pathname.startsWith("/api/")) return true;

  const host = request.headers.get("host");
  if (!host) return false;

  const origin = request.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }

  const referer = request.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).host === host;
    } catch {
      return false;
    }
  }

  // Peticiones same-origin desde fetch del navegador suelen incluir Origin o Referer.
  return false;
}

export function isBodyTooLarge(request: NextRequest): boolean {
  const method = request.method.toUpperCase();
  if (!["POST", "PUT", "PATCH"].includes(method)) return false;

  const len = request.headers.get("content-length");
  if (!len) return false;
  const n = Number(len);
  return Number.isFinite(n) && n > MAX_API_BODY_BYTES;
}
