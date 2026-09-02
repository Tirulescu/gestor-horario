export interface Interval {
  start: number;
  end: number;
}

export function subtract(a: Interval, b: Interval): Interval[] {
  if (b.start >= a.end || b.end <= a.start) return [a];
  const res: Interval[] = [];
  if (b.start > a.start) res.push({ start: a.start, end: b.start });
  if (b.end < a.end) res.push({ start: b.end, end: a.end });
  return res;
}

export function splitFree(free: Interval[], taken: Interval): Interval[] {
  const res: Interval[] = [];
  for (const f of free) res.push(...subtract(f, taken));
  return mergeIntervals(res);
}

/** Une franjas solapadas o contiguas para que una clase pueda cruzar el borde. */
export function mergeIntervals(intervals: Interval[]): Interval[] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const out: Interval[] = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const last = out[out.length - 1];
    if (sorted[i].start <= last.end + 1e-9) {
      last.end = Math.max(last.end, sorted[i].end);
    } else {
      out.push({ ...sorted[i] });
    }
  }
  return out;
}

export function mergeFreeByDay(
  freeByDay: Record<number, Interval[]>,
): Record<number, Interval[]> {
  const out: Record<number, Interval[]> = {};
  for (const dStr of Object.keys(freeByDay)) {
    const day = Number(dStr);
    const merged = mergeIntervals(freeByDay[day] ?? []);
    if (merged.length > 0) out[day] = merged;
  }
  return out;
}

export function cloneFreeByDay(
  freeByDay: Record<number, Interval[]>,
): Record<number, Interval[]> {
  const out: Record<number, Interval[]> = {};
  for (const dStr of Object.keys(freeByDay)) {
    const day = Number(dStr);
    out[day] = (freeByDay[day] ?? []).map((i) => ({ ...i }));
  }
  return out;
}

export function occupy(
  freeByDay: Record<number, Interval[]>,
  day: number,
  taken: Interval,
): void {
  if (!freeByDay[day]) return;
  freeByDay[day] = splitFree(freeByDay[day], taken);
}
