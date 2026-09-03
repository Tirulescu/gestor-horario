/** Paleta pastel complementaria (12 tonos distintos alrededor del círculo cromático). */
export const SUBJECT_COLOR_PRESETS = [
  "#e07a8a", // rosa coral
  "#e0986a", // albaricoque
  "#d4b45c", // mostaza suave
  "#9bc86e", // lima pastel
  "#6cc49a", // menta
  "#5cbcb4", // agua
  "#6aade0", // cielo
  "#7b94e0", // periwinkle
  "#9b7ce0", // lavanda
  "#c87ad4", // orquídea
  "#e07ab8", // fucsia suave
  "#c4a078", // arena
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
