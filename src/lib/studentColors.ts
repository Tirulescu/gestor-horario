/** Paleta y resolución de color de alumno (misma UX que asignaturas). */
export {
  SUBJECT_COLOR_PRESETS as STUDENT_COLOR_PRESETS,
  normalizeSubjectColor as normalizeStudentColor,
  subjectColorError as studentColorError,
} from "@/lib/subjectColors";

import {
  SUBJECT_COLOR_PRESETS,
  normalizeSubjectColor,
  type SubjectWithColor,
} from "@/lib/subjectColors";

export type StudentWithColor = SubjectWithColor;

export function resolveStudentColor(student: StudentWithColor, index: number): string {
  const custom = normalizeSubjectColor(student.color);
  if (custom) return custom;
  return SUBJECT_COLOR_PRESETS[index % SUBJECT_COLOR_PRESETS.length];
}

export function buildStudentColorMap(students: StudentWithColor[]): Record<number, string> {
  const m: Record<number, string> = {};
  students.forEach((s, i) => {
    m[s.id] = resolveStudentColor(s, i);
  });
  return m;
}
