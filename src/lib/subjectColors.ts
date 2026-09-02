/** Paleta de colores preseleccionados para asignaturas. */
export const SUBJECT_COLOR_PRESETS = [
  "#2563eb",
  "#1d4ed8",
  "#0891b2",
  "#4f46e5",
  "#0284c7",
  "#7c3aed",
  "#0e7490",
  "#4338ca",
  "#dc2626",
  "#16a34a",
  "#d97706",
  "#db2777",
] as const;

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export function normalizeSubjectColor(value: unknown): string | null {
  if (value == null || value === "") return null;
  const raw = String(value).trim();
  const hex = raw.startsWith("#") ? raw : `#${raw}`;
  if (!HEX_COLOR_RE.test(hex)) return null;
  return hex.toLowerCase();
}

export function subjectColorError(value: unknown): string | null {
  if (value == null || value === "") return null;
  return normalizeSubjectColor(value) ? null : "Color inválido (usa #RRGGBB)";
}

export interface SubjectWithColor {
  id: number;
  color?: string | null;
}

export function resolveSubjectColor(subject: SubjectWithColor, index: number): string {
  const custom = normalizeSubjectColor(subject.color);
  if (custom) return custom;
  return SUBJECT_COLOR_PRESETS[index % SUBJECT_COLOR_PRESETS.length];
}

export function buildSubjectColorMap(subjects: SubjectWithColor[]): Record<number, string> {
  const m: Record<number, string> = {};
  subjects.forEach((s, i) => {
    m[s.id] = resolveSubjectColor(s, i);
  });
  return m;
}
