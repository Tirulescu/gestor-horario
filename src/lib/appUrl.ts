const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function isLocalHost(hostname: string): boolean {
  return LOCAL_HOSTS.has(hostname);
}

/** Origen seguro para redirects tras OAuth (servidor). */
export function getRequestOrigin(request: Request): string {
  const url = new URL(request.url);
  if (isLocalHost(url.hostname)) {
    return url.origin;
  }

  const host = request.headers.get("x-forwarded-host");
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  if (host && process.env.NODE_ENV === "production") {
    return `${proto}://${host}`;
  }

  return url.origin;
}

/** Origen de la app en el cliente (OAuth redirectTo). */
export function getClientAppOrigin(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  }
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return "http://localhost:3000";
}

export function buildAuthCallbackUrl(next: string, origin?: string): string {
  const base = origin ?? getClientAppOrigin();
  const safeNext = next.startsWith("/") ? next : "/";
  return `${base}/auth/callback?next=${encodeURIComponent(safeNext)}`;
}
