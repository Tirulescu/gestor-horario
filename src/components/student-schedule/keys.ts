import type { TimeRange } from "@/lib/studentAvailability";

export function availRemoveKey(studentId: number, r: TimeRange) {
  return `${studentId}:${r.day}:${r.start}:${r.end}`;
}

export function blockRemoveKey(studentId: number, index: number) {
  return `${studentId}:${index}`;
}

export function toggleKey(prev: Set<string>, key: string) {
  const n = new Set(prev);
  if (n.has(key)) n.delete(key);
  else n.add(key);
  return n;
}

export function toggleId(prev: Set<number>, id: number) {
  const n = new Set(prev);
  if (n.has(id)) n.delete(id);
  else n.add(id);
  return n;
}
