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

const store = new Map<string, Bucket>();
let lastPrune = Date.now();

function pruneStore(now: number) {
  if (now - lastPrune < 60_000) return;
  lastPrune = now;
  for (const [key, bucket] of store) {
    if (bucket.resetAt <= now) store.delete(key);
  }
}

export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
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

export function checkRateLimit(request: NextRequest): { ok: true } | { ok: false; retryAfter: number } {
  if (!request.nextUrl.pathname.startsWith("/api/") && !request.nextUrl.pathname.startsWith("/auth/")) {
    return { ok: true };
  }

  const now = Date.now();
  pruneStore(now);

  const cfg = WINDOWS[windowKey(request)];
  const ip = getClientIp(request);
  const key = `${windowKey(request)}:${ip}:${request.nextUrl.pathname}`;
  let bucket = store.get(key);

  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + cfg.windowMs };
    store.set(key, bucket);
  }

  bucket.count += 1;
  if (bucket.count > cfg.limit) {
    return { ok: false, retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
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
