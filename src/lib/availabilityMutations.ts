import type { TimeRange } from "@/lib/studentAvailability";

function piecesPayload(pieces: TimeRange[]) {
  return pieces.map((p) => ({ dayOfWeek: p.day, startHour: p.start, endHour: p.end }));
}

async function readError(res: Response): Promise<string> {
  return (await res.json().catch(() => ({}))).error || "No se pudo guardar";
}

/** Persiste el resultado de tallar una disponibilidad existente (atómico en servidor). */
export async function replaceAvailabilityPieces(
  id: number,
  pieces: TimeRange[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch("/api/availabilities", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ replace: { id, pieces: piecesPayload(pieces) } }),
  });
  if (!res.ok) return { ok: false, error: await readError(res) };
  return { ok: true };
}

/** Borra y crea franjas en una sola transacción. */
export async function persistAvailabilityAdds(args: {
  removeIds: number[];
  adds: TimeRange[];
}): Promise<{ ok: true; removed: number; saved: number } | { ok: false; error: string }> {
  const res = await fetch("/api/availabilities", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apply: {
        removeIds: args.removeIds,
        adds: piecesPayload(args.adds),
      },
    }),
  });
  if (!res.ok) return { ok: false, error: await readError(res) };
  const data = (await res.json()) as { removed?: number; saved?: number };
  return {
    ok: true,
    removed: data.removed ?? 0,
    saved: data.saved ?? 0,
  };
}
