import type { TimeRange } from "@/lib/studentAvailability";

/** Persiste el resultado de tallar una disponibilidad existente. */
export async function replaceAvailabilityPieces(
  id: number,
  pieces: TimeRange[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (pieces.length === 0) {
    const res = await fetch(`/api/availabilities?id=${id}`, { method: "DELETE" });
    if (!res.ok) return { ok: false, error: "No se pudo quitar la franja" };
    return { ok: true };
  }

  if (pieces.length === 1) {
    const p = pieces[0];
    const res = await fetch("/api/availabilities", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, dayOfWeek: p.day, startHour: p.start, endHour: p.end }),
    });
    if (!res.ok) {
      return { ok: false, error: (await res.json().catch(() => ({}))).error || "No se pudo guardar" };
    }
    return { ok: true };
  }

  const del = await fetch(`/api/availabilities?id=${id}`, { method: "DELETE" });
  if (!del.ok) return { ok: false, error: "No se pudo quitar la franja" };
  for (const p of pieces) {
    const res = await fetch("/api/availabilities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dayOfWeek: p.day, startHour: p.start, endHour: p.end }),
    });
    if (!res.ok) {
      return { ok: false, error: (await res.json().catch(() => ({}))).error || "No se pudo guardar" };
    }
  }
  return { ok: true };
}

/** Crea franjas nuevas, o PATCH de un id existente si solo queda una pieza. */
export async function persistAvailabilityAdds(args: {
  removeIds: number[];
  adds: TimeRange[];
}): Promise<{ ok: true; removed: number; saved: number } | { ok: false; error: string }> {
  const { removeIds, adds } = args;

  // 1 remove + 1 add → 1 piece: editar in-place
  if (removeIds.length === 1 && adds.length === 1) {
    const res = await fetch("/api/availabilities", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: removeIds[0],
        dayOfWeek: adds[0].day,
        startHour: adds[0].start,
        endHour: adds[0].end,
      }),
    });
    if (!res.ok) {
      return { ok: false, error: (await res.json().catch(() => ({}))).error || "No se pudo guardar" };
    }
    return { ok: true, removed: 0, saved: 1 };
  }

  let removed = 0;
  for (const id of removeIds) {
    const res = await fetch(`/api/availabilities?id=${id}`, { method: "DELETE" });
    if (!res.ok) return { ok: false, error: "No se pudo quitar la franja" };
    removed++;
  }

  let saved = 0;
  for (const r of adds) {
    const res = await fetch("/api/availabilities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dayOfWeek: r.day, startHour: r.start, endHour: r.end }),
    });
    if (!res.ok) {
      return { ok: false, error: (await res.json().catch(() => ({}))).error || "No se pudo guardar" };
    }
    saved++;
  }

  return { ok: true, removed, saved };
}
