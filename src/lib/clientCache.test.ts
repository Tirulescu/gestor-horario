import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CACHE_MAX_AGE_MS,
  clearAllCache,
  fetchApi,
  fetchApiJson,
  hasFresh,
  hasFreshAll,
  invalidate,
  needsRefresh,
  onCacheStale,
  put,
  warmData,
} from "./clientCache";

const STALE_KEY = "__gestorHorarioStale";
const LS_PREFIX = "__agc:";

function mockFetch(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

describe("clientCache", () => {
  beforeEach(() => {
    clearAllCache();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("put y warmData devuelven datos válidos", () => {
    put("/api/subjects", [{ id: 1, name: "Mates" }]);
    expect(warmData("/api/subjects")).toEqual([{ id: 1, name: "Mates" }]);
    expect(hasFresh("/api/subjects")).toBe(true);
  });

  it("warmData ignora payloads de error cacheados", () => {
    put("/api/teachers", { error: "No autenticado" });
    expect(warmData("/api/teachers")).toBeNull();
  });

  it("invalidate marca stale y warmData devuelve null", () => {
    put("/api/students", [{ id: 2 }]);
    invalidate("/api/students");
    expect(warmData("/api/students")).toBeNull();
    expect(window.localStorage.getItem(`${LS_PREFIX}/api/students`)).toBeNull();
  });

  it("clearAllCache vacía memoria, localStorage y flags stale", () => {
    put("/api/subjects", [{ id: 1 }]);
    put("/api/students", [{ id: 2 }]);
    invalidate("/api/subjects");

    clearAllCache();

    expect(warmData("/api/subjects")).toBeNull();
    expect(warmData("/api/students")).toBeNull();
    expect(window.localStorage.getItem(STALE_KEY)).toBeNull();
    expect(window.localStorage.getItem(`${LS_PREFIX}/api/subjects`)).toBeNull();
  });

  it("fetchApiJson valida respuestas OK y de error", async () => {
    vi.stubGlobal("fetch", mockFetch([{ id: 1 }]));
    await expect(fetchApiJson("/api/teachers")).resolves.toEqual({
      ok: true,
      data: [{ id: 1 }],
    });

    vi.stubGlobal("fetch", mockFetch({ error: "No autorizado" }, 403));
    await expect(fetchApiJson("/api/teachers")).resolves.toEqual({
      ok: false,
      status: 403,
    });
  });

  it("fetchApi devuelve datos en éxito", async () => {
    vi.stubGlobal("fetch", mockFetch([{ id: 7, name: "Ana" }]));
    await expect(fetchApi("/api/teachers")).resolves.toEqual([{ id: 7, name: "Ana" }]);
  });

  it("fetchApi en 401 vacía toda la caché", async () => {
    put("/api/subjects", [{ id: 1 }]);
    put("/api/students", [{ id: 2 }]);

    vi.stubGlobal("fetch", mockFetch({ error: "No autenticado" }, 401));
    await expect(fetchApi("/api/teachers")).resolves.toBeNull();

    expect(warmData("/api/subjects")).toBeNull();
    expect(warmData("/api/students")).toBeNull();
  });

  it("hasFreshAll y needsRefresh respetan edad de caché", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));

    put("/api/a", [1]);
    put("/api/b", [2]);
    expect(hasFreshAll(["/api/a", "/api/b"])).toBe(true);
    expect(needsRefresh(["/api/a", "/api/b"])).toBe(false);

    vi.setSystemTime(new Date("2026-01-01T12:00:00Z").getTime() + CACHE_MAX_AGE_MS + 1);
    expect(hasFreshAll(["/api/a", "/api/b"])).toBe(true);
    expect(needsRefresh(["/api/a", "/api/b"])).toBe(true);
  });

  it("onCacheStale se dispara al invalidar en la misma pestaña", () => {
    const listener = vi.fn();
    const off = onCacheStale(listener);

    put("/api/assignments", [{ id: 1 }]);
    invalidate("/api/assignments");

    expect(listener).toHaveBeenCalledTimes(1);
    off();
  });

  it("evento storage entre pestañas limpia memoria y notifica stale", () => {
    const listener = vi.fn();
    const off = onCacheStale(listener);

    put("/api/subjects", [{ id: 3 }]);
    expect(warmData("/api/subjects")).not.toBeNull();

    window.localStorage.setItem(STALE_KEY, JSON.stringify(["/api/subjects"]));
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: STALE_KEY,
        newValue: JSON.stringify(["/api/subjects"]),
      }),
    );

    expect(warmData("/api/subjects")).toBeNull();
    expect(listener).toHaveBeenCalled();
    off();
  });
});
