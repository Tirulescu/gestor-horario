"use client";

import { useEffect, useMemo, useState } from "react";
import { Ban, CalendarClock, CalendarPlus, Plus, Save, X } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { DAYS } from "@/lib/validate";
import { fmtDayRange, fmtHour, hourOptions, endHourFromDuration, fmtDurationMin, resolveMemberDurationMin } from "@/lib/hours";
import {
  getAssignmentEffectiveRanges,
  getFreeHourSetsForDays,
  getSlotHourSetsFromRanges,
  slotOverlapsBlocked,
  subtractBlockedFromDayRanges,
  type TimeRange,
} from "@/lib/studentAvailability";

interface Student {
  id: number;
  name: string;
  email?: string | null;
  grade?: string | null;
  blockedRanges?: TimeRange[];
  availableRanges?: TimeRange[];
}

interface SubjectOption {
  id: number;
  name: string;
  defaultDurationMin: number;
  isCollective?: boolean;
}

interface SubjectLink {
  subjectId: number;
  studentId: number;
  durationMin?: number | null;
}

interface Availability {
  dayOfWeek: number;
  startHour: number;
  endHour: number;
}

interface OccupiedSlot {
  dayOfWeek: number;
  startHour: number;
  endHour: number;
  studentId?: number;
}

type TargetMode = "student" | "grade" | "multiple";
type ActionType = "availability" | "block" | "event";

type ConfirmRemove =
  | { kind: "availability"; student: Student; range: TimeRange; label: string }
  | { kind: "block"; student: Student; index: number; label: string }
  | null;

interface StudentScheduleManageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  students: Student[];
  grades: string[];
  subjects: SubjectOption[];
  subjectLinks: SubjectLink[];
  availabilities: Availability[];
  /** Eventos/reservas del profesor (no solapables con clases). */
  teacherBlocks?: OccupiedSlot[];
  /** Clases ya asignadas (profesor y alumnos). */
  assignments?: OccupiedSlot[];
  initialStudentId?: number | null;
  saving?: boolean;
  onSaveAvailability: (targets: Student[], ranges: TimeRange[]) => Promise<void>;
  onSaveBlock: (targets: Student[], days: number[], start: number, end: number, title: string) => Promise<void>;
  onSaveEvent: (
    targets: Student[],
    subjectId: number,
    days: number[],
    start: number,
    endForStudent: (student: Student) => number,
  ) => Promise<void>;
  onRemoveAvailability: (student: Student, range: TimeRange) => Promise<void>;
  onRemoveBlock: (student: Student, index: number) => Promise<void>;
}

const HOURS_START = hourOptions(8, 23);
const HOURS_END = hourOptions(9, 24);

function intersectSets(sets: Set<string>[]): Set<string> {
  if (sets.length === 0) return new Set();
  let out = sets[0];
  for (let i = 1; i < sets.length; i++) {
    out = new Set([...out].filter((v) => sets[i].has(v)));
  }
  return out;
}

export default function StudentScheduleManageDialog({
  open,
  onOpenChange,
  students,
  grades,
  subjects,
  subjectLinks,
  availabilities,
  teacherBlocks = [],
  assignments = [],
  initialStudentId = null,
  saving = false,
  onSaveAvailability,
  onSaveBlock,
  onSaveEvent,
  onRemoveAvailability,
  onRemoveBlock,
}: StudentScheduleManageDialogProps) {
  const [action, setAction] = useState<ActionType>("availability");
  const [targetMode, setTargetMode] = useState<TargetMode>("student");
  const [studentId, setStudentId] = useState("");
  const [grade, setGrade] = useState("");
  const [group, setGroup] = useState<Set<number>>(new Set());
  const [eventSubjectId, setEventSubjectId] = useState("");
  const [days, setDays] = useState<Set<number>>(new Set([1]));
  const [start, setStart] = useState("16");
  const [end, setEnd] = useState("18");
  const [blockTitle, setBlockTitle] = useState("");
  const [pendingAvail, setPendingAvail] = useState<TimeRange[]>([]);
  const [addErr, setAddErr] = useState("");
  const [confirmRemove, setConfirmRemove] = useState<ConfirmRemove>(null);

  useEffect(() => {
    if (!open) {
      setPendingAvail([]);
      return;
    }
    if (initialStudentId != null) {
      setTargetMode("student");
      setStudentId(String(initialStudentId));
      setAction("availability");
    } else {
      setTargetMode("student");
      setStudentId("");
      setGrade("");
      setGroup(new Set());
      setAction("availability");
    }
    setEventSubjectId("");
    setDays(new Set([1]));
    setStart("16");
    setEnd("18");
    setBlockTitle("");
    setPendingAvail([]);
    setAddErr("");
    setConfirmRemove(null);
  }, [open, initialStudentId]);

  const targets = useMemo(() => {
    if (targetMode === "student") return students.filter((s) => String(s.id) === studentId);
    if (targetMode === "grade") return students.filter((s) => (s.grade ?? "").trim() === grade);
    return students.filter((s) => group.has(s.id));
  }, [students, targetMode, studentId, grade, group]);

  const singleTarget = targets.length === 1 ? targets[0] : null;

  const enrolledTargets = useMemo(() => {
    if (!eventSubjectId) return [];
    const sid = Number(eventSubjectId);
    return targets.filter((st) =>
      subjectLinks.some((l) => l.subjectId === sid && l.studentId === st.id),
    );
  }, [targets, eventSubjectId, subjectLinks]);

  const eventSubjects = useMemo(() => {
    const ids = new Set(targets.map((t) => t.id));
    return subjects.filter((sub) =>
      subjectLinks.some((l) => l.subjectId === sub.id && ids.has(l.studentId)),
    );
  }, [subjects, subjectLinks, targets]);

  const selectedSubject = subjects.find((s) => String(s.id) === eventSubjectId) ?? null;

  function memberFor(subjectId: number, studentId: number) {
    return subjectLinks.find((l) => l.subjectId === subjectId && l.studentId === studentId) ?? null;
  }

  function durationForStudent(st: Student): number | null {
    if (!selectedSubject) return null;
    const member = memberFor(selectedSubject.id, st.id);
    return resolveMemberDurationMin(selectedSubject, member ? { durationMin: member.durationMin ?? null } : null);
  }

  const eventSlotDuration = useMemo(() => {
    if (action !== "event" || !selectedSubject || enrolledTargets.length === 0) return null;
    const durations = enrolledTargets
      .map((st) => durationForStudent(st))
      .filter((d): d is number => d != null);
    if (durations.length === 0) return null;
    return Math.min(...durations);
  }, [action, selectedSubject, enrolledTargets, subjectLinks]);

  const eventHourSets = useMemo(() => {
    if (action !== "event" || !eventSlotDuration || days.size === 0 || enrolledTargets.length === 0) {
      return { startSet: new Set<string>(), endSet: new Set<string>() };
    }
    // Dentro de disponibilidad (profesor ∩ alumno) y sin solapar bloqueos/eventos.
    const slotStudents = enrolledTargets.map((st) => ({
      available: st.availableRanges ?? [],
      blocked: [
        ...(st.blockedRanges ?? []),
        ...assignments
          .filter((a) => a.studentId === st.id)
          .map((a) => ({ day: a.dayOfWeek, start: a.startHour, end: a.endHour })),
      ],
    }));
    const teacherBusy = [
      ...teacherBlocks.map((b) => ({ day: b.dayOfWeek, start: b.startHour, end: b.endHour })),
      ...assignments.map((a) => ({ day: a.dayOfWeek, start: a.startHour, end: a.endHour })),
    ];

    const daySets = [...days].map((day) => {
      let ranges = getAssignmentEffectiveRanges(day, availabilities, slotStudents);
      ranges = subtractBlockedFromDayRanges(
        ranges,
        teacherBusy.filter((b) => b.day === day).map((b) => ({ start: b.start, end: b.end })),
      );
      return getSlotHourSetsFromRanges(ranges, HOURS_START, HOURS_END, start, eventSlotDuration).startSet;
    });
    const startSet = intersectSets(daySets);
    const endSet = start !== "" && startSet.has(start)
      ? new Set([String(endHourFromDuration(Number(start), eventSlotDuration))])
      : new Set<string>();
    return { startSet, endSet };
  }, [action, eventSlotDuration, days, enrolledTargets, availabilities, start, teacherBlocks, assignments]);

  const manageHourSets = useMemo(() => {
    if (action === "event") return { startSet: new Set<string>(), endSet: new Set<string>() };
    // Bloqueos: pueden estar fuera de la disponibilidad; no solapar otros bloqueos.
    if (action === "block") {
      return getFreeHourSetsForDays(
        [...days],
        targets.flatMap((st) => st.blockedRanges ?? []),
        HOURS_START,
        HOURS_END,
        start,
      );
    }
    // Disponibilidad: solo huecos libres (sin bloqueos).
    const blocked = [
      ...targets.flatMap((st) => st.blockedRanges ?? []),
      ...pendingAvail,
    ];
    return getFreeHourSetsForDays([...days], blocked, HOURS_START, HOURS_END, start);
  }, [action, days, targets, pendingAvail, start]);

  const hourSets = action === "event" ? eventHourSets : manageHourSets;

  const eventEndLabel = useMemo(() => {
    if (action !== "event" || start === "" || !selectedSubject) return "—";
    if (enrolledTargets.length === 1) {
      const dur = durationForStudent(enrolledTargets[0]);
      return dur != null ? fmtHour(endHourFromDuration(Number(start), dur)) : "—";
    }
    if (selectedSubject.isCollective && eventSlotDuration != null) {
      return fmtHour(endHourFromDuration(Number(start), eventSlotDuration));
    }
    const ends = enrolledTargets
      .map((st) => durationForStudent(st))
      .filter((d): d is number => d != null)
      .map((d) => fmtHour(endHourFromDuration(Number(start), d)));
    const unique = [...new Set(ends)];
    return unique.length === 1 ? unique[0] : unique.join(" · ");
  }, [action, start, selectedSubject, enrolledTargets, eventSlotDuration, subjectLinks]);

  useEffect(() => {
    setAddErr("");
  }, [action, targetMode, studentId, grade, group, days, start, end, eventSubjectId]);

  useEffect(() => {
    if (hourSets.startSet.size === 0) return;
    if (!hourSets.startSet.has(start)) {
      setStart(Array.from(hourSets.startSet)[0]);
    }
  }, [hourSets.startSet, start, action, days, eventSubjectId, targets, pendingAvail]);

  useEffect(() => {
    if (action === "event") return;
    if (hourSets.endSet.size === 0) return;
    if (!hourSets.endSet.has(end)) {
      setEnd(Array.from(hourSets.endSet)[0]);
    }
  }, [action, hourSets.endSet, end]);

  useEffect(() => {
    if (action === "event" && eventSubjects.length === 1 && !eventSubjectId) {
      setEventSubjectId(String(eventSubjects[0].id));
    }
  }, [action, eventSubjects, eventSubjectId]);

  function toggleDay(day: number) {
    setDays((prev) => {
      const n = new Set(prev);
      if (n.has(day)) n.delete(day);
      else n.add(day);
      return n;
    });
  }

  function formErr(): string {
    if (targets.length === 0) return "Selecciona a quién afecta";
    if (days.size === 0) return "Selecciona al menos un día";
    if (start === "" || end === "") return "";
    if (action === "block" && !(Number(end) > Number(start))) {
      return "La hora de fin debe ser posterior a la de inicio";
    }
    if (action === "availability" && pendingAvail.length === 0) {
      return "Añade al menos una franja de disponibilidad";
    }
    if (action === "event") {
      if (!eventSubjectId) return "Selecciona una asignatura";
      if (enrolledTargets.length === 0) return "Ningún alumno seleccionado está inscrito en esa asignatura";
      if (eventHourSets.startSet.size === 0) return "No hay horario disponible en común para ese día";
    }
    if (action === "availability" && days.size > 0 && manageHourSets.startSet.size === 0) {
      return "No hay horas libres (sin bloqueos) para los días seleccionados";
    }
    if (action === "block" && days.size > 0 && manageHourSets.startSet.size === 0) {
      return "No hay huecos libres: chocan con otros bloqueos";
    }
    return "";
  }
  const err = formErr();

  function blockedConflictMessage(range: TimeRange, forTargets = targets): string | null {
    for (const st of forTargets) {
      if (slotOverlapsBlocked(range.day, range.start, range.end, st.blockedRanges ?? [])) {
        return `La franja ${fmtDayRange(range.day, range.start, range.end)} choca con un bloqueo de ${st.name}`;
      }
    }
    return null;
  }

  function addPendingAvailForEachDay() {
    const s = Number(start);
    const e = Number(end);
    if (!(e > s) || days.size === 0) return;
    if (targets.length === 0) {
      setAddErr("Selecciona a quién afecta");
      return;
    }
    const toAdd: TimeRange[] = [];
    for (const day of days) {
      const range = { day, start: s, end: e };
      const dup = pendingAvail.some((r) => r.day === day && r.end > s && r.start < e);
      if (dup) continue;
      const conflict = blockedConflictMessage(range);
      if (conflict) {
        setAddErr(conflict);
        return;
      }
      toAdd.push(range);
    }
    if (toAdd.length === 0) {
      setAddErr("Esa franja ya está en la lista");
      return;
    }
    setAddErr("");
    setPendingAvail((cur) => [...cur, ...toAdd].sort((a, b) => a.day - b.day || a.start - b.start));
  }

  function removePendingAvail(target: TimeRange) {
    setPendingAvail((cur) =>
      cur.filter((r) => !(r.day === target.day && r.start === target.start && r.end === target.end))
    );
  }

  function hourItem(o: { value: string; label: string }, allowed: Set<string>) {
    if (!allowed.has(o.value)) return null;
    return <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>;
  }

  async function handleSubmit() {
    if (err) return;
    if (action === "availability") {
      for (const r of pendingAvail) {
        const conflict = blockedConflictMessage(r);
        if (conflict) {
          setAddErr(conflict);
          return;
        }
      }
      await onSaveAvailability(targets, pendingAvail);
      setPendingAvail([]);
      onOpenChange(false);
    } else if (action === "block") {
      await onSaveBlock(targets, [...days], Number(start), Number(end), blockTitle.trim());
      onOpenChange(false);
    } else {
      const subjectId = Number(eventSubjectId);
      await onSaveEvent(
        enrolledTargets,
        subjectId,
        [...days],
        Number(start),
        (st) => {
          const dur = durationForStudent(st);
          if (dur == null) return Number(start);
          return endHourFromDuration(Number(start), dur);
        },
      );
      onOpenChange(false);
    }
  }

  async function handleConfirmRemove() {
    if (!confirmRemove) return;
    if (confirmRemove.kind === "availability") {
      await onRemoveAvailability(confirmRemove.student, confirmRemove.range);
    } else {
      await onRemoveBlock(confirmRemove.student, confirmRemove.index);
    }
    setConfirmRemove(null);
  }

  return (
    <>
    <Dialog open={open} onOpenChange={(o) => { if (!o) onOpenChange(false); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock size={18} className="text-blue-600" />
            Gestionar horario
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto" style={{ maxHeight: "62dvh" }}>
          <div>
            <Label>¿Qué quieres hacer?</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              <button type="button" onClick={() => setAction("event")} className={`chip ${action === "event" ? "chip-active" : ""}`}>
                Añadir o modificar evento
              </button>
              <button type="button" onClick={() => setAction("availability")} className={`chip ${action === "availability" ? "chip-active" : ""}`}>
                Añadir o modificar disponibilidad
              </button>
              <button type="button" onClick={() => setAction("block")} className={`chip ${action === "block" ? "chip-active" : ""}`}>
                Añadir o modificar bloqueos
              </button>
            </div>
          </div>

          <div>
            <Label>¿A quién afecta?</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              <button type="button" onClick={() => setTargetMode("student")} className={`chip ${targetMode === "student" ? "chip-active" : ""}`}>Un alumno</button>
              <button type="button" onClick={() => setTargetMode("grade")} className={`chip ${targetMode === "grade" ? "chip-active" : ""}`}>Un curso</button>
              <button type="button" onClick={() => setTargetMode("multiple")} className={`chip ${targetMode === "multiple" ? "chip-active" : ""}`}>Varios alumnos</button>
            </div>
          </div>

          {targetMode === "student" && (
            <div>
              <Label htmlFor="sm-student">Alumno</Label>
              <Select value={studentId} onValueChange={setStudentId}>
                <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                <SelectContent>
                  {students.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.name}{s.grade ? ` · ${s.grade}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {targetMode === "grade" && (
            <div>
              <Label htmlFor="sm-grade">Curso</Label>
              {grades.length === 0 ? (
                <p className="text-xs text-gray-500 mt-1">Ningún alumno con curso.</p>
              ) : (
                <Select value={grade} onValueChange={setGrade}>
                  <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                  <SelectContent>
                    {grades.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}
          {targetMode === "multiple" && (
            <div>
              <Label>Alumnos</Label>
              <div className="space-y-1.5 mt-1 max-h-[28dvh] overflow-y-auto">
                {students.map((s) => (
                  <label
                    key={s.id}
                    className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm cursor-pointer transition-colors ${
                      group.has(s.id)
                        ? "bg-[#eff6ff] border-[var(--accent)]/40"
                        : "bg-gray-50 border-gray-100"
                    }`}
                  >
                    <Checkbox
                      checked={group.has(s.id)}
                      onChange={() => setGroup((prev) => {
                        const n = new Set(prev);
                        if (n.has(s.id)) n.delete(s.id);
                        else n.add(s.id);
                        return n;
                      })}
                    />
                    <span className="font-medium">{s.name}</span>
                    {s.grade ? <span className="text-xs text-gray-500">· {s.grade}</span> : null}
                  </label>
                ))}
              </div>
            </div>
          )}

          {targets.length > 0 && (
            <p className="text-xs text-gray-500">
              Afecta a <strong>{targets.length}</strong> alumno{targets.length !== 1 ? "s" : ""}
              {targets.length <= 3 ? `: ${targets.map((t) => t.name).join(", ")}` : ""}
            </p>
          )}

          {action === "event" && targets.length > 0 && (
            <div>
              <Label htmlFor="sm-subject">Asignatura</Label>
              {eventSubjects.length === 0 ? (
                <p className="text-xs text-gray-500 mt-1">Sin asignaturas en la selección.</p>
              ) : (
                <Select value={eventSubjectId} onValueChange={setEventSubjectId}>
                  <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                  <SelectContent>
                    {eventSubjects.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.name}{s.isCollective ? " · Colectiva" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {selectedSubject && eventSlotDuration != null && (
                <p className="text-xs text-gray-500 mt-1">
                  Duración: {fmtDurationMin(eventSlotDuration)}
                  {selectedSubject.isCollective ? " · sesión compartida" : ""}
                </p>
              )}
            </div>
          )}

          {singleTarget && action === "availability" && (singleTarget.blockedRanges ?? []).length > 0 && (
            <div className="rounded-lg border border-red-100 bg-red-50/50 p-3 space-y-1.5">
              <p className="text-xs font-medium text-red-900">Horas bloqueadas (no se pueden marcar como disponibles)</p>
              <div className="flex flex-wrap gap-1.5">
                {(singleTarget.blockedRanges ?? []).map((r, i) => (
                  <span key={i} className="text-xs bg-white text-red-800 border border-red-200 rounded-full px-2.5 py-0.5">
                    {fmtDayRange(r.day, r.start, r.end)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {singleTarget && action === "availability" && (singleTarget.availableRanges ?? []).length > 0 && (
            <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-3 space-y-1.5">
              <p className="text-xs font-medium text-emerald-900">Disponibilidad actual</p>
              <div className="flex flex-wrap gap-1.5">
                {(singleTarget.availableRanges ?? []).map((r, i) => (
                  <span key={i} className="inline-flex items-center gap-1 text-xs bg-white text-emerald-800 border border-emerald-200 rounded-full pl-2.5 pr-1 py-0.5">
                    {fmtDayRange(r.day, r.start, r.end)}
                    <button
                      type="button"
                      onClick={() => setConfirmRemove({
                        kind: "availability",
                        student: singleTarget,
                        range: r,
                        label: `¿Quitar disponibilidad de ${singleTarget.name} el ${fmtDayRange(r.day, r.start, r.end)}?`,
                      })}
                      className="inline-flex items-center justify-center w-5 h-5 rounded-full hover:bg-emerald-100"
                      aria-label="Quitar franja"
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {singleTarget && action === "block" && (singleTarget.blockedRanges ?? []).length > 0 && (
            <div className="rounded-lg border border-red-100 bg-red-50/50 p-3 space-y-1.5">
              <p className="text-xs font-medium text-red-900">Bloqueos actuales</p>
              <div className="flex flex-wrap gap-1.5">
                {(singleTarget.blockedRanges ?? []).map((r, i) => (
                  <span key={i} className="inline-flex items-center gap-1 text-xs bg-white text-red-800 border border-red-200 rounded-full pl-2.5 pr-1 py-0.5">
                    {r.title?.trim() ? `${r.title.trim()} · ` : ""}{fmtDayRange(r.day, r.start, r.end)}
                    <button
                      type="button"
                      onClick={() => setConfirmRemove({
                        kind: "block",
                        student: singleTarget,
                        index: i,
                        label: `¿Quitar bloqueo${r.title?.trim() ? ` «${r.title.trim()}»` : ""} de ${singleTarget.name} el ${fmtDayRange(r.day, r.start, r.end)}?`,
                      })}
                      className="inline-flex items-center justify-center w-5 h-5 rounded-full hover:bg-red-100"
                      aria-label="Quitar bloqueo"
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {action === "availability" && pendingAvail.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {pendingAvail.map((r, i) => (
                <span key={i} className="inline-flex items-center gap-1 text-xs bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-full pl-2.5 pr-1 py-0.5">
                  {fmtDayRange(r.day, r.start, r.end)}
                  <button type="button" onClick={() => removePendingAvail(r)} className="inline-flex items-center justify-center w-5 h-5 rounded-full hover:bg-emerald-100" aria-label="Quitar">
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-3 space-y-3">
            <p className="text-xs font-medium text-gray-600">
              {action === "event" ? "Nuevo evento (clase)" : action === "availability" ? "Nueva franja de disponibilidad" : "Nuevo bloqueo"}
            </p>
            {action === "block" && (
              <div>
                <Label htmlFor="st-block-title">Nombre</Label>
                <Input
                  id="st-block-title"
                  value={blockTitle}
                  onChange={(e) => setBlockTitle(e.target.value)}
                  placeholder="Ej: Extraescolar, viaje, médico…"
                />
              </div>
            )}
            <div>
              <Label>Días</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {DAYS.map((d, i) => (
                  <label
                    key={i}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-sm cursor-pointer transition-colors ${
                      days.has(i)
                        ? "bg-[#eff6ff] border-[var(--accent)] text-[var(--accent)]"
                        : "bg-white border-gray-200 text-gray-700"
                    }`}
                  >
                    <Checkbox
                      size="sm"
                      checked={days.has(i)}
                      onChange={() => toggleDay(i)}
                    />
                    {d}
                  </label>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>{action === "event" ? "Hora de inicio" : "Desde"}</Label>
                {action === "event" ? (
                  <Select value={start} onValueChange={setStart}>
                    <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                    <SelectContent>
                      {HOURS_START.map((o) => hourItem(o, hourSets.startSet))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Select value={start} onValueChange={setStart} disabled={hourSets.startSet.size === 0}>
                    <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                    <SelectContent>
                      {HOURS_START.map((o) => hourItem(o, hourSets.startSet))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div>
                <Label>{action === "event" ? "Hora de fin" : "Hasta"}</Label>
                {action === "event" ? (
                  <div className="flex h-9 items-center rounded-md border border-gray-200 bg-gray-50 px-3 text-sm tabular-nums">
                    {eventEndLabel}
                  </div>
                ) : (
                  <Select value={end} onValueChange={setEnd} disabled={hourSets.endSet.size === 0}>
                    <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                    <SelectContent>
                      {HOURS_END.map((o) => hourItem(o, hourSets.endSet))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
            {action === "availability" && (
              <Button type="button" variant="outline" className="w-full" onClick={addPendingAvailForEachDay} disabled={hourSets.startSet.size === 0 || hourSets.endSet.size === 0}>
                <Plus size={14} /> Añadir franja{days.size > 1 ? "s" : ""}
              </Button>
            )}
          </div>

          {action === "event" && (
            <p className="text-xs text-gray-500">
              Solo dentro del horario disponible; no pueden solapar otros eventos o bloqueos.
            </p>
          )}

          {action === "block" && (
            <p className="text-xs text-gray-500">
              Pueden estar fuera de la disponibilidad; no pueden solapar otros bloqueos.
            </p>
          )}

          {action === "availability" && (
            <p className="text-xs text-gray-500">
              Solo horas libres, sin bloqueos.
            </p>
          )}

          {(addErr || err) && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {addErr || err}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}><X size={14} /> Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving || !!err || (action === "availability" && !!addErr)}>
            {action === "event" ? (
              <><CalendarPlus size={14} /> Crear evento</>
            ) : action === "availability" ? (
              <><Save size={14} /> Guardar disponibilidad{pendingAvail.length > 0 ? ` (${pendingAvail.length})` : ""}</>
            ) : (
              <><Ban size={14} /> Bloquear</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

      <AlertDialog open={confirmRemove !== null} onOpenChange={(o) => { if (!o) setConfirmRemove(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmRemove?.kind === "block" ? "Quitar bloqueo" : "Quitar disponibilidad"}
            </AlertDialogTitle>
            <AlertDialogDescription>{confirmRemove?.label}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmRemove}>Quitar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
