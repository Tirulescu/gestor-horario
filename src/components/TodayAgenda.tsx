"use client";

import { useMemo } from "react";
import { Clock, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fmtRange } from "@/lib/hours";
import { DAYS_LONG } from "@/lib/validate";
import { buildSubjectColorMap } from "@/lib/subjectColors";

export interface TodayAssignment {
  id: number;
  subjectId: number;
  studentId: number;
  dayOfWeek: number;
  startHour: number;
  endHour: number;
  collectiveSessionId?: string | null;
  student?: { id: number; name: string } | null;
  subject?: { id: number; name: string; isCollective?: boolean } | null;
}

export interface TodaySubject {
  id: number;
  name: string;
  color?: string | null;
  isCollective?: boolean;
}

interface TodayAgendaProps {
  assignments: TodayAssignment[];
  subjects: TodaySubject[];
  students: { id: number; name: string }[];
}

export function todayDayOfWeek(): number {
  return (new Date().getDay() + 6) % 7;
}

/** Sesiones de hoy: individuales = 1 por alumno; colectivas = 1 por grupo. */
export function countTodaySessions(
  assignments: Pick<TodayAssignment, "dayOfWeek" | "collectiveSessionId" | "id">[],
  today = todayDayOfWeek(),
): number {
  const todayAssignments = assignments.filter((a) => a.dayOfWeek === today);
  const seenCollective = new Set<string>();
  let count = 0;
  for (const a of todayAssignments) {
    if (a.collectiveSessionId) {
      if (seenCollective.has(a.collectiveSessionId)) continue;
      seenCollective.add(a.collectiveSessionId);
    }
    count++;
  }
  return count;
}

interface AgendaItem {
  key: string;
  startHour: number;
  endHour: number;
  subjectName: string;
  subjectId: number;
  studentLabel: string;
  isCollective: boolean;
}

export default function TodayAgenda({ assignments, subjects, students }: TodayAgendaProps) {
  const today = todayDayOfWeek();
  const subjectColors = useMemo(() => buildSubjectColorMap(subjects), [subjects]);
  const dayName = DAYS_LONG[today];

  const items = useMemo(() => {
    const todayAssignments = assignments.filter((a) => a.dayOfWeek === today);
    const seenCollective = new Set<string>();
    const rows: AgendaItem[] = [];

    for (const a of todayAssignments) {
      if (a.collectiveSessionId) {
        if (seenCollective.has(a.collectiveSessionId)) continue;
        seenCollective.add(a.collectiveSessionId);
        const group = todayAssignments.filter((x) => x.collectiveSessionId === a.collectiveSessionId);
        rows.push({
          key: a.collectiveSessionId,
          startHour: a.startHour,
          endHour: a.endHour,
          subjectId: a.subjectId,
          subjectName: a.subject?.name ?? subjects.find((s) => s.id === a.subjectId)?.name ?? "Asignatura",
          studentLabel: group
            .map((g) => g.student?.name ?? students.find((s) => s.id === g.studentId)?.name ?? "")
            .filter(Boolean)
            .join(", "),
          isCollective: true,
        });
      } else {
        rows.push({
          key: String(a.id),
          startHour: a.startHour,
          endHour: a.endHour,
          subjectId: a.subjectId,
          subjectName: a.subject?.name ?? subjects.find((s) => s.id === a.subjectId)?.name ?? "Asignatura",
          studentLabel: a.student?.name ?? students.find((s) => s.id === a.studentId)?.name ?? "",
          isCollective: false,
        });
      }
    }

    return rows.sort((a, b) => a.startHour - b.startHour);
  }, [assignments, subjects, students, today]);

  return (
    <Card className="today-agenda p-4 sm:p-5 space-y-3">
      <div className="today-agenda-header">
        <h2 className="today-agenda-title">Clases de hoy</h2>
        <span className="today-agenda-day">{dayName}</span>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-gray-500">No tienes clases hoy.</p>
      ) : (
        <ul className="today-agenda-list">
          {items.map((item) => (
            <li key={item.key} className="today-agenda-item">
              <span
                className="today-agenda-swatch"
                style={{ backgroundColor: subjectColors[item.subjectId] ?? "#2563eb" }}
                aria-hidden
              />
              <div className="today-agenda-item-body min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-gray-900 text-sm">{item.subjectName}</span>
                  {item.isCollective && (
                    <Badge variant="success" className="gap-1">
                      <Users size={11} /> Colectiva
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-gray-600 truncate" title={item.studentLabel}>
                  {item.studentLabel}
                </p>
              </div>
              <span className="today-agenda-time tabular-nums">
                <Clock size={13} className="inline mr-1 opacity-60" aria-hidden />
                {fmtRange(item.startHour, item.endHour)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
