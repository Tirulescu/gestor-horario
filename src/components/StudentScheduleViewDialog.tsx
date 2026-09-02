"use client";

import { useEffect, useMemo, useState } from "react";
import { Calendar } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import WeekGrid, { type WeekBlock } from "@/components/WeekGrid";
import { fmtDayRange, fmtRange, fmtDurationMin, SCHEDULE_DAY_START, SCHEDULE_DAY_END } from "@/lib/hours";
import { DAYS } from "@/lib/validate";
import {
  rangesToZones,
  teacherAvailsToRanges,
  unavailableOutsideAvailable,
  type TimeRange,
} from "@/lib/studentAvailability";

const COLORS = ["#2563eb", "#1d4ed8", "#0891b2", "#4f46e5", "#0284c7", "#7c3aed", "#0e7490", "#4338ca"];

interface Subject { id: number; name: string; }
interface Assignment {
  id: number; subjectId: number; dayOfWeek: number; startHour: number; endHour: number;
  origin: string; subject?: { id: number; name: string };
}
interface TeacherAvailability { dayOfWeek: number; startHour: number; endHour: number; }

interface StudentScheduleViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: {
    id: number;
    name: string;
    availableRanges?: TimeRange[];
    blockedRanges?: TimeRange[];
  } | null;
  subjects?: Subject[];
  /** Disponibilidad del profesor: las rayas del fondo marcan fuera de ella. */
  teacherAvailabilities?: TeacherAvailability[];
}

export default function StudentScheduleViewDialog({
  open,
  onOpenChange,
  student,
  subjects = [],
  teacherAvailabilities = [],
}: StudentScheduleViewDialogProps) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);

  useEffect(() => {
    if (!open || !student) {
      setAssignments([]);
      return;
    }
    let alive = true;
    fetch(`/api/assignments?studentId=${student.id}`)
      .then((r) => r.json())
      .then((rows: Assignment[]) => { if (alive) setAssignments(rows); })
      .catch(() => { if (alive) setAssignments([]); });
    return () => { alive = false; };
  }, [open, student?.id]);

  const subjectColor = useMemo(() => {
    const m: Record<number, string> = {};
    let ci = 0;
    for (const s of subjects) m[s.id] = COLORS[ci++ % COLORS.length];
    return m;
  }, [subjects]);

  const ranges = student?.availableRanges ?? [];
  const blocked = student?.blockedRanges ?? [];

  const assignmentBlocks: WeekBlock[] = useMemo(
    () => assignments.map((a) => {
      const subjectName = a.subject?.name ?? subjects.find((s) => s.id === a.subjectId)?.name ?? "Asignatura";
      const durationMin = Math.round((a.endHour - a.startHour) * 60);
      return {
        id: a.id,
        dayOfWeek: a.dayOfWeek,
        startHour: a.startHour,
        endHour: a.endHour,
        title: subjectName,
        subtitle: undefined,
        color: subjectColor[a.subjectId] ?? "#2563eb",
        detailTitle: subjectName,
        details: [
          { label: "Alumno", value: student?.name ?? "—" },
          { label: "Día", value: DAYS[a.dayOfWeek] },
          { label: "Horario", value: fmtRange(a.startHour, a.endHour) },
          { label: "Duración", value: fmtDurationMin(durationMin) },
        ],
      };
    }),
    [assignments, subjects, subjectColor, student?.name],
  );

  const teacherRanges = useMemo(
    () => teacherAvailsToRanges(teacherAvailabilities),
    [teacherAvailabilities],
  );

  const legend = useMemo(() => {
    const items: { label: string; color: string; dashed?: boolean; striped?: boolean }[] = [];
    if (teacherRanges.length > 0) {
      items.push({ label: "Profesor no disponible", color: "#94a3b8", striped: true });
    }
    if (ranges.length > 0) items.push({ label: "Disponible (alumno)", color: "#22c55e", dashed: true });
    if (blocked.length > 0) items.push({ label: "Bloqueado", color: "#ef4444" });
    const scheduledIds = new Set(assignments.map((a) => a.subjectId));
    for (const sub of subjects) {
      if (scheduledIds.has(sub.id)) {
        items.push({ label: sub.name, color: subjectColor[sub.id] ?? "#2563eb" });
      }
    }
    return items;
  }, [teacherRanges.length, ranges.length, blocked.length, assignments, subjects, subjectColor]);

  const availZones = useMemo(() => rangesToZones(ranges), [ranges]);
  const blockedZones = useMemo(() => rangesToZones(blocked), [blocked]);
  const unavail = useMemo(
    () => unavailableOutsideAvailable(teacherRanges, SCHEDULE_DAY_START, SCHEDULE_DAY_END),
    [teacherRanges],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar size={18} className="text-blue-600" />
            Horario de {student?.name ?? "alumno"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <WeekGrid
            compact
            hourHeight={64}
            startH={SCHEDULE_DAY_START}
            endH={SCHEDULE_DAY_END}
            inDialog
            allowFullscreen
            fullscreenTitle={student ? `Horario de ${student.name}` : "Horario del alumno"}
            blocks={assignmentBlocks}
            availableZones={availZones}
            blockedZones={blockedZones}
            unavailable={unavail}
            showLegend
            legend={legend}
          />

          {(ranges.length > 0 || blocked.length > 0 || assignments.length > 0) && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              {ranges.length > 0 && (
                <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-3 space-y-1.5">
                  <p className="font-medium text-emerald-900">Disponibilidad</p>
                  <div className="flex flex-wrap gap-1">
                    {ranges.map((r, i) => (
                      <span key={i} className="rounded-full bg-white/80 border border-emerald-200 px-2 py-0.5 text-emerald-800">
                        {fmtDayRange(r.day, r.start, r.end)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {blocked.length > 0 && (
                <div className="rounded-lg border border-red-100 bg-red-50/60 p-3 space-y-1.5">
                  <p className="font-medium text-red-900">Bloqueos</p>
                  <div className="flex flex-wrap gap-1">
                    {blocked.map((r, i) => (
                      <span key={i} className="rounded-full bg-white/80 border border-red-200 px-2 py-0.5 text-red-800">
                        {r.title?.trim() ? `${r.title.trim()} · ` : ""}{fmtDayRange(r.day, r.start, r.end)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {assignments.length > 0 && (
                <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-3 space-y-1.5 sm:col-span-1">
                  <p className="font-medium text-blue-900">Clases ({assignments.length})</p>
                  <div className="flex flex-wrap gap-1">
                    {assignments.map((a) => (
                      <span
                        key={a.id}
                        className="rounded-full border px-2 py-0.5"
                        style={{
                          backgroundColor: `${subjectColor[a.subjectId] ?? "#2563eb"}18`,
                          borderColor: `${subjectColor[a.subjectId] ?? "#2563eb"}40`,
                          color: subjectColor[a.subjectId] ?? "#2563eb",
                        }}
                      >
                        {a.subject?.name ?? subjects.find((s) => s.id === a.subjectId)?.name ?? "Asignatura"}
                        {" · "}
                        {fmtDayRange(a.dayOfWeek, a.startHour, a.endHour)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {ranges.length === 0 && blocked.length === 0 && assignments.length === 0 && (
            <p className="text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
              Sin franjas ni clases definidas. El alumno se considera disponible en cualquier hora.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
