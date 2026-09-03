"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, Pencil, Trash2, X } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import WeekGrid, { type WeekBlock } from "@/components/WeekGrid";
import { fmtRange, SCHEDULE_DAY_START, SCHEDULE_DAY_END } from "@/lib/hours";
import { DAYS } from "@/lib/validate";
import { isExternalClass, type TimeRange } from "@/lib/studentAvailability";
import { buildStudentColorMap } from "@/lib/studentColors";
import { useHideWeekends } from "@/lib/useTeacherProfile";

interface Student {
  id: number;
  name: string;
  grade?: string | null;
  color?: string | null;
  blockedRanges?: TimeRange[];
}

interface Subject {
  id: number;
  name: string;
  color?: string | null;
}

interface Assignment {
  id: number;
  subjectId: number;
  studentId: number;
  dayOfWeek: number;
  startHour: number;
  endHour: number;
  collectiveSessionId?: string | null;
  subject?: { id: number; name: string } | null;
  student?: { id: number; name: string } | null;
}

interface StudentsCalendarDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  students: Student[];
  subjects?: Subject[];
  assignments?: Assignment[];
  onEditAssignment?: (assignmentId: number) => void;
  onDeleteAssignment?: (assignmentId: number) => void;
}

function overlaps(
  a: { dayOfWeek: number; startHour: number; endHour: number },
  b: { dayOfWeek: number; startHour: number; endHour: number },
) {
  return a.dayOfWeek === b.dayOfWeek && a.endHour > b.startHour && a.startHour < b.endHour;
}

function SlotOverlapDialog({
  open,
  onOpenChange,
  day,
  startHour,
  endHour,
  items,
  onEditAssignment,
  onDeleteAssignment,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  day: number;
  startHour: number;
  endHour: number;
  items: WeekBlock[];
  onEditAssignment?: (assignmentId: number) => void;
  onDeleteAssignment?: (assignmentId: number) => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      onOpenChange(false);
    };
    // Capture: cierra el detalle antes que el calendario ampliado / el dialog padre.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onOpenChange]);

  if (!mounted || !open) return null;

  const title = `${DAYS[day]} · ${fmtRange(startHour, endHour)}`;

  return createPortal(
    <div
      className="fixed inset-0 z-[320] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-slot-overlap-dialog=""
      style={{ pointerEvents: "auto" }}
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]"
        aria-label="Cerrar"
        onClick={() => onOpenChange(false)}
      />
      <div className="relative w-full max-w-md rounded-2xl bg-white p-5 shadow-[0_20px_50px_0_rgb(0_0_0/0.25)] max-h-[min(80dvh,560px)] flex flex-col">
        <button
          type="button"
          className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
          aria-label="Cerrar"
          onClick={() => onOpenChange(false)}
        >
          <X className="h-4 w-4" />
        </button>
        <div className="mb-3 pr-10">
          <h2 className="text-lg font-semibold leading-snug">En esta franja</h2>
          <p className="mt-1 text-sm text-gray-500">
            {title} · {items.length} elemento{items.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="space-y-2.5 overflow-y-auto min-h-0">
          {items.map((item) => {
            const assignmentId =
              item.payload?.kind === "assignment"
                ? (item.payload.assignmentId ?? item.id)
                : null;
            return (
              <div
                key={item.id}
                className="rounded-xl border border-gray-100 bg-gray-50/80 p-3"
              >
                <div className="flex items-start gap-2">
                  <span
                    className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: item.color }}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm leading-snug">
                      {item.detailTitle ?? item.title}
                    </p>
                    {item.subtitle && (
                      <p className="text-xs text-gray-500 mt-0.5 capitalize">{item.subtitle}</p>
                    )}
                    {item.details && item.details.length > 0 && (
                      <dl className="mt-2 space-y-1 text-xs">
                        {item.details.map((row) => (
                          <div key={row.label} className="flex justify-between gap-2">
                            <dt className="text-gray-500 shrink-0">{row.label}</dt>
                            <dd className="font-medium text-right text-gray-800">{row.value}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </div>
                </div>
                {assignmentId != null && (onEditAssignment || onDeleteAssignment) && (
                  <div className="flex items-center gap-1 mt-2 ml-4.5 pl-0.5">
                    {onEditAssignment && (
                      <button
                        type="button"
                        onClick={() => onEditAssignment(assignmentId)}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                      >
                        <Pencil size={12} aria-hidden />
                        Editar
                      </button>
                    )}
                    {onDeleteAssignment && (
                      <button
                        type="button"
                        onClick={() => onDeleteAssignment(assignmentId)}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors"
                      >
                        <Trash2 size={12} aria-hidden />
                        Borrar
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default function StudentsCalendarDialog({
  open,
  onOpenChange,
  students,
  subjects = [],
  assignments = [],
  onEditAssignment,
  onDeleteAssignment,
}: StudentsCalendarDialogProps) {
  const hideWeekends = useHideWeekends();
  const [gradeFilter, setGradeFilter] = useState("all");
  const [studentFilter, setStudentFilter] = useState("all");
  const [slotOpen, setSlotOpen] = useState(false);
  const [slotFocus, setSlotFocus] = useState<WeekBlock | null>(null);

  const closeSlot = useCallback(() => {
    setSlotOpen(false);
    setSlotFocus(null);
  }, []);

  const handleCalendarOpenChange = useCallback(
    (next: boolean) => {
      // Si hay un detalle abierto, Escape / overlay cierran primero ese.
      if (!next && slotOpen) {
        closeSlot();
        return;
      }
      onOpenChange(next);
    },
    [slotOpen, closeSlot, onOpenChange],
  );

  useEffect(() => {
    if (!open) return;
    setGradeFilter("all");
    setStudentFilter("all");
    closeSlot();
  }, [open, closeSlot]);

  const grades = useMemo(
    () => Array.from(new Set(students.map((s) => (s.grade ?? "").trim()).filter(Boolean))).sort(),
    [students],
  );

  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      if (gradeFilter !== "all" && (s.grade ?? "").trim() !== gradeFilter) return false;
      if (studentFilter !== "all" && s.id !== Number(studentFilter)) return false;
      return true;
    });
  }, [students, gradeFilter, studentFilter]);

  const studentsInGrade = useMemo(() => {
    if (gradeFilter === "all") return students;
    return students.filter((s) => (s.grade ?? "").trim() === gradeFilter);
  }, [students, gradeFilter]);

  useEffect(() => {
    if (studentFilter === "all") return;
    if (!studentsInGrade.some((s) => s.id === Number(studentFilter))) {
      setStudentFilter("all");
    }
  }, [studentsInGrade, studentFilter]);

  const colorByStudent = useMemo(
    () => buildStudentColorMap(students),
    [students],
  );

  const filteredStudentIds = useMemo(
    () => new Set(filteredStudents.map((s) => s.id)),
    [filteredStudents],
  );

  const items: WeekBlock[] = useMemo(() => {
    const out: WeekBlock[] = [];

    for (const s of filteredStudents) {
      const color = colorByStudent[s.id] ?? "#e07a8a";
      (s.blockedRanges ?? []).forEach((r, i) => {
        const external = isExternalClass(r);
        const name = r.title?.trim() || (external ? "Otra asignatura" : "Bloqueo");
        const typeLabel = external ? "Otra asignatura" : "Bloqueo";
        out.push({
          id: -(s.id * 10000 + i + 1),
          dayOfWeek: r.day,
          startHour: r.start,
          endHour: r.end,
          title: name,
          subtitle: s.name,
          color,
          detailTitle: name,
          details: [
            { label: "Alumno", value: s.name },
            { label: "Tipo", value: typeLabel },
            { label: "Nombre", value: name },
            { label: "Día", value: DAYS[r.day] },
            { label: "Horario", value: fmtRange(r.start, r.end) },
          ],
          payload: { kind: "student-block", studentId: s.id, blockIndex: i },
        });
      });
    }

    for (const a of assignments) {
      if (!filteredStudentIds.has(a.studentId)) continue;
      const studentName =
        a.student?.name ??
        students.find((s) => s.id === a.studentId)?.name ??
        "Alumno";
      const subjectName =
        a.subject?.name ??
        subjects.find((s) => s.id === a.subjectId)?.name ??
        "Asignatura";
      const color = colorByStudent[a.studentId] ?? "#e07a8a";
      out.push({
        id: a.id,
        dayOfWeek: a.dayOfWeek,
        startHour: a.startHour,
        endHour: a.endHour,
        title: subjectName,
        subtitle: studentName,
        color,
        detailTitle: subjectName,
        details: [
          { label: "Alumno", value: studentName },
          { label: "Tipo", value: "Clase" },
          { label: "Asignatura", value: subjectName },
          { label: "Día", value: DAYS[a.dayOfWeek] },
          { label: "Horario", value: fmtRange(a.startHour, a.endHour) },
        ],
        payload: { kind: "assignment", studentId: a.studentId, assignmentId: a.id },
      });
    }

    return out;
  }, [filteredStudents, filteredStudentIds, assignments, students, subjects, colorByStudent]);

  const legend = useMemo(() => {
    const present = new Set<number>();
    for (const s of filteredStudents) {
      if ((s.blockedRanges ?? []).length > 0) present.add(s.id);
    }
    for (const a of assignments) {
      if (filteredStudentIds.has(a.studentId)) present.add(a.studentId);
    }
    return filteredStudents
      .filter((s) => present.has(s.id))
      .map((s) => ({
        label: s.name,
        color: colorByStudent[s.id] ?? "#e07a8a",
      }));
  }, [filteredStudents, filteredStudentIds, assignments, colorByStudent]);

  const handleBlockClick = useCallback((block: WeekBlock) => {
    setSlotFocus(block);
    setSlotOpen(true);
  }, []);

  const overlapping = useMemo(() => {
    if (!slotFocus) return [];
    return items
      .filter((b) => overlaps(b, slotFocus))
      .sort((a, b) => a.startHour - b.startHour || a.title.localeCompare(b.title));
  }, [items, slotFocus]);

  return (
    <Dialog open={open} onOpenChange={handleCalendarOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays size={18} className="text-blue-600" />
            Calendarios de alumnos
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto" style={{ maxHeight: "70dvh" }}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Curso</Label>
              <Select value={gradeFilter} onValueChange={setGradeFilter}>
                <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los cursos</SelectItem>
                  {grades.map((g) => (
                    <SelectItem key={g} value={g}>{g}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Alumno</Label>
              <Select value={studentFilter} onValueChange={setStudentFilter}>
                <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los alumnos</SelectItem>
                  {studentsInGrade.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.name}{s.grade ? ` · ${s.grade}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {items.length === 0 ? (
            <p className="text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
              Ningún evento con los filtros seleccionados.
            </p>
          ) : (
            <WeekGrid
              compact
              hourHeight={64}
              startH={SCHEDULE_DAY_START}
              endH={SCHEDULE_DAY_END}
              hideWeekends={hideWeekends}
              inDialog
              allowFullscreen
              fullscreenTitle="Calendarios de alumnos"
              blocks={items}
              showLegend
              legend={legend}
              onBlockClick={handleBlockClick}
            />
          )}

          {items.length > 0 && (
            <p className="text-xs text-gray-500">
              Pulsa un bloque para ver el detalle.
            </p>
          )}
        </div>

        {/* Anidado para que Escape / overlay cierren primero el detalle. */}
        <SlotOverlapDialog
          open={slotOpen && !!slotFocus}
          onOpenChange={(o) => {
            if (!o) closeSlot();
            else setSlotOpen(true);
          }}
          day={slotFocus?.dayOfWeek ?? 0}
          startHour={slotFocus?.startHour ?? 0}
          endHour={slotFocus?.endHour ?? 0}
          items={overlapping}
          onEditAssignment={onEditAssignment}
          onDeleteAssignment={onDeleteAssignment}
        />
      </DialogContent>
    </Dialog>
  );
}
