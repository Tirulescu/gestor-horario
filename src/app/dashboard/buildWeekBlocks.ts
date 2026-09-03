import type { WeekBlock } from "@/components/WeekGrid";
import { DAYS } from "@/lib/validate";
import { fmtRange, fmtDurationMin, resolveMemberDurationMin } from "@/lib/hours";
import type { Assignment, Subject, SubjectStudent, TeacherBlock } from "./types";

export function buildTeacherBlockBlocks(teacherBlocks: TeacherBlock[]): WeekBlock[] {
  return teacherBlocks.map((b) => ({
    id: 1000000 + b.id,
    dayOfWeek: b.dayOfWeek,
    startHour: b.startHour,
    endHour: b.endHour,
    title: b.title,
    subtitle: "bloqueo",
    color: "#475569",
    detailTitle: b.title,
    details: [
      { label: "Tipo", value: "Bloqueo" },
      { label: "Día", value: DAYS[b.dayOfWeek] },
      { label: "Horario", value: fmtRange(b.startHour, b.endHour) },
    ],
  }));
}

export function buildAssignmentBlocks(args: {
  assignments: Assignment[];
  subjects: Subject[];
  subjectStudents: SubjectStudent[];
  subjectColor: Record<number, string>;
  subjectNames: Record<number, string>;
}): WeekBlock[] {
  const { assignments, subjects, subjectStudents, subjectColor, subjectNames } = args;

  function memberFor(subjectId: number, studentId: number) {
    return subjectStudents.find((ss) => ss.subjectId === subjectId && ss.studentId === studentId) ?? null;
  }

  const collectiveGroups = new Map<string, Assignment[]>();
  const individual: Assignment[] = [];

  for (const a of assignments) {
    if (a.collectiveSessionId) {
      const g = collectiveGroups.get(a.collectiveSessionId) ?? [];
      g.push(a);
      collectiveGroups.set(a.collectiveSessionId, g);
    } else {
      individual.push(a);
    }
  }

  const blocks: WeekBlock[] = individual.map((a) => {
    const subj = subjects.find((s) => s.id === a.subjectId);
    const dur = subj ? resolveMemberDurationMin(subj, memberFor(a.subjectId, a.studentId)) : null;
    const subjectName = a.subject?.name ?? subjectNames[a.subjectId] ?? "Asignatura";
    const studentName = a.student?.name ?? `#${a.studentId}`;
    return {
      id: a.id,
      dayOfWeek: a.dayOfWeek,
      startHour: a.startHour,
      endHour: a.endHour,
      title: `${subjectName} — ${studentName}`,
      subtitle: undefined,
      color: subjectColor[a.subjectId] ?? "#2563eb",
      detailTitle: subjectName,
      details: [
        { label: "Alumno", value: studentName },
        { label: "Día", value: DAYS[a.dayOfWeek] },
        { label: "Horario", value: fmtRange(a.startHour, a.endHour) },
        ...(dur != null ? [{ label: "Duración", value: fmtDurationMin(dur) }] : []),
      ],
    };
  });

  for (const [, group] of collectiveGroups) {
    const first = group[0];
    const subj = subjects.find((s) => s.id === first.subjectId);
    const names = group.map((a) => a.student?.name ?? `#${a.studentId}`).join(", ");
    const subjectName = first.subject?.name ?? subjectNames[first.subjectId] ?? "Asignatura";
    blocks.push({
      id: first.id,
      dayOfWeek: first.dayOfWeek,
      startHour: first.startHour,
      endHour: first.endHour,
      title: `${subjectName} (colectiva)`,
      subtitle: `${group.length} alumno(s): ${names}`,
      color: subjectColor[first.subjectId] ?? "#2563eb",
      detailTitle: `${subjectName} (colectiva)`,
      details: [
        { label: "Alumnos", value: names },
        { label: "Día", value: DAYS[first.dayOfWeek] },
        { label: "Horario", value: fmtRange(first.startHour, first.endHour) },
        ...(subj ? [{ label: "Duración", value: fmtDurationMin(subj.defaultDurationMin) }] : []),
      ],
    });
  }

  return blocks;
}
