"use client";

import { useEffect, useMemo, useState } from "react";
import { Ban, CalendarClock, CalendarPlus, Save, X } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { fmtDayRange, SCHEDULE_HOURS_START, SCHEDULE_HOURS_END, endHourFromDuration, fmtDurationMin, resolveMemberDurationMin, slotDurationMin } from "@/lib/hours";
import {
  getFreeHourSetsForDays,
  slotOverlapsBlocked,
  type TimeRange,
} from "@/lib/studentAvailability";
import { availRemoveKey, blockRemoveKey, toggleKey, toggleId } from "./keys";
import type {
  ActionType,
  Student,
  StudentScheduleManageDialogProps,
  TargetMode,
} from "./types";
import TargetPicker from "./TargetPicker";
import ScheduleSlotForm from "./ScheduleSlotForm";

const HOURS_START = SCHEDULE_HOURS_START;
const HOURS_END = SCHEDULE_HOURS_END;

export default function StudentScheduleManageDialog({
  open,
  onOpenChange,
  students,
  grades,
  subjects,
  subjectLinks,
  teacherBlocks = [],
  assignments = [],
  initialStudentId = null,
  saving = false,
  onApplyAvailability,
  onApplyBlocks,
  onApplyEvents,
}: StudentScheduleManageDialogProps) {
  const [action, setAction] = useState<ActionType>("availability");
  const [targetMode, setTargetMode] = useState<TargetMode>("student");
  const [studentId, setStudentId] = useState("");
  const [grade, setGrade] = useState("");
  const [group, setGroup] = useState<Set<number>>(new Set());
  const [eventSubjectId, setEventSubjectId] = useState("");
  const [days, setDays] = useState<Set<number>>(new Set());
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [blockTitle, setBlockTitle] = useState("");
  const [pendingAvail, setPendingAvail] = useState<TimeRange[]>([]);
  const [pendingBlocks, setPendingBlocks] = useState<TimeRange[]>([]);
  const [pendingRemoveAvail, setPendingRemoveAvail] = useState<Set<string>>(new Set());
  const [pendingRemoveBlocks, setPendingRemoveBlocks] = useState<Set<string>>(new Set());
  const [pendingRemoveEvents, setPendingRemoveEvents] = useState<Set<number>>(new Set());
  const [addErr, setAddErr] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const busy = saving || submitting;

  useEffect(() => {
    if (!open) {
      setPendingAvail([]);
      setPendingBlocks([]);
      setPendingRemoveAvail(new Set());
      setPendingRemoveBlocks(new Set());
      setPendingRemoveEvents(new Set());
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
    setDays(new Set());
    setStart("");
    setEnd("");
    setBlockTitle("");
    setPendingAvail([]);
    setPendingBlocks([]);
    setPendingRemoveAvail(new Set());
    setPendingRemoveBlocks(new Set());
    setPendingRemoveEvents(new Set());
    setAddErr("");
  }, [open, initialStudentId]);

  useEffect(() => {
    setPendingRemoveAvail(new Set());
    setPendingRemoveBlocks(new Set());
    setPendingRemoveEvents(new Set());
    setDays(new Set());
    setStart("");
    setEnd("");
    setEventSubjectId("");
    setBlockTitle("");
    setPendingAvail([]);
    setPendingBlocks([]);
    setAddErr("");
  }, [action, targetMode, studentId, grade, group]);

  const targets = useMemo(() => {
    if (targetMode === "student") return students.filter((s) => String(s.id) === studentId);
    if (targetMode === "grade") return students.filter((s) => (s.grade ?? "").trim() === grade);
    return students.filter((s) => group.has(s.id));
  }, [students, targetMode, studentId, grade, group]);

  const singleTarget = targets.length === 1 ? targets[0] : null;
  const targetIds = useMemo(() => new Set(targets.map((t) => t.id)), [targets]);
  const showStudentName = targets.length > 1;

  const existingAvailability = useMemo(() => {
    const rows: { key: string; student: Student; range: TimeRange }[] = [];
    for (const st of targets) {
      (st.availableRanges ?? []).forEach((r, i) => {
        rows.push({
          key: `av-${st.id}-${i}-${r.day}-${r.start}-${r.end}`,
          student: st,
          range: r,
        });
      });
    }
    return rows.sort(
      (a, b) =>
        a.range.day - b.range.day ||
        a.range.start - b.range.start ||
        a.student.name.localeCompare(b.student.name),
    );
  }, [targets]);

  const existingBlocks = useMemo(() => {
    const rows: { key: string; student: Student; range: TimeRange; index: number }[] = [];
    for (const st of targets) {
      (st.blockedRanges ?? []).forEach((r, i) => {
        rows.push({
          key: `bl-${st.id}-${i}-${r.day}-${r.start}-${r.end}`,
          student: st,
          range: r,
          index: i,
        });
      });
    }
    return rows.sort(
      (a, b) =>
        a.range.day - b.range.day ||
        a.range.start - b.range.start ||
        a.student.name.localeCompare(b.student.name),
    );
  }, [targets]);

  const existingEvents = useMemo(() => {
    const rows = assignments.filter((a) => targetIds.has(a.studentId));
    // Agrupar colectivas: una fila por sesión (usar el primer id para borrar).
    const seenCollective = new Set<string>();
    const out: {
      key: string;
      assignmentId: number;
      title: string;
      subtitle: string;
      day: number;
      start: number;
      end: number;
      collective: boolean;
    }[] = [];
    for (const a of rows.sort((x, y) => x.dayOfWeek - y.dayOfWeek || x.startHour - y.startHour)) {
      if (a.collectiveSessionId) {
        if (seenCollective.has(a.collectiveSessionId)) continue;
        seenCollective.add(a.collectiveSessionId);
        const peers = rows.filter((p) => p.collectiveSessionId === a.collectiveSessionId);
        const names = peers
          .map((p) => p.student?.name ?? targets.find((t) => t.id === p.studentId)?.name ?? `#${p.studentId}`)
          .join(", ");
        const subjectName =
          a.subject?.name ?? subjects.find((s) => s.id === a.subjectId)?.name ?? "Asignatura";
        out.push({
          key: `ev-c-${a.collectiveSessionId}`,
          assignmentId: a.id,
          title: `${subjectName} (colectiva)`,
          subtitle: names,
          day: a.dayOfWeek,
          start: a.startHour,
          end: a.endHour,
          collective: true,
        });
      } else {
        const studentName =
          a.student?.name ?? targets.find((t) => t.id === a.studentId)?.name ?? `#${a.studentId}`;
        const subjectName =
          a.subject?.name ?? subjects.find((s) => s.id === a.subjectId)?.name ?? "Asignatura";
        out.push({
          key: `ev-${a.id}`,
          assignmentId: a.id,
          title: subjectName,
          subtitle: studentName,
          day: a.dayOfWeek,
          start: a.startHour,
          end: a.endHour,
          collective: false,
        });
      }
    }
    return out;
  }, [assignments, targetIds, targets, subjects]);

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

  function effectiveBlocked(st: Student): TimeRange[] {
    return (st.blockedRanges ?? []).filter(
      (_, i) => !pendingRemoveBlocks.has(blockRemoveKey(st.id, i)),
    );
  }

  const eventHourSets = useMemo(() => {
    if (action !== "event" || !eventSlotDuration || days.size === 0 || enrolledTargets.length === 0) {
      return { startSet: new Set<string>(), endSet: new Set<string>() };
    }
    // Pueden estar fuera de disponibilidad; no solapar bloqueos / reservas / otras clases.
    const occupied: TimeRange[] = [
      ...enrolledTargets.flatMap((st) => effectiveBlocked(st)),
      ...teacherBlocks.map((b) => ({ day: b.dayOfWeek, start: b.startHour, end: b.endHour })),
      ...assignments
        .filter((a) => !pendingRemoveEvents.has(a.id))
        .map((a) => ({ day: a.dayOfWeek, start: a.startHour, end: a.endHour })),
    ];
    return getFreeHourSetsForDays(
      [...days],
      occupied,
      HOURS_START,
      HOURS_END,
      start || undefined,
      eventSlotDuration,
    );
  }, [action, eventSlotDuration, days, enrolledTargets, start, teacherBlocks, assignments, pendingRemoveBlocks, pendingRemoveEvents]);

  const manageHourSets = useMemo(() => {
    if (action === "event") return { startSet: new Set<string>(), endSet: new Set<string>() };
    // Bloqueos: pueden estar fuera de la disponibilidad; no solapar otros bloqueos.
    if (action === "block") {
      return getFreeHourSetsForDays(
        [...days],
        [...targets.flatMap((st) => effectiveBlocked(st)), ...pendingBlocks],
        HOURS_START,
        HOURS_END,
        start || undefined,
      );
    }
    // Disponibilidad: solo huecos libres (sin bloqueos).
    const blocked = [
      ...targets.flatMap((st) => effectiveBlocked(st)),
      ...pendingAvail,
    ];
    return getFreeHourSetsForDays([...days], blocked, HOURS_START, HOURS_END, start || undefined);
  }, [action, days, targets, pendingAvail, pendingBlocks, pendingRemoveBlocks, start]);

  const hourSets = action === "event" ? eventHourSets : manageHourSets;

  useEffect(() => {
    setAddErr("");
  }, [action, targetMode, studentId, grade, group, days, start, end, eventSubjectId, blockTitle]);

  // Si la hora elegida deja de ser válida, se vacía (no se rellena otra por defecto).
  useEffect(() => {
    if (start === "") return;
    if (hourSets.startSet.size === 0 || !hourSets.startSet.has(start)) {
      setStart("");
    }
  }, [hourSets.startSet, start, action, days, eventSubjectId, targets, pendingAvail, pendingBlocks]);

  useEffect(() => {
    if (end === "") return;
    if (start === "" || hourSets.endSet.size === 0 || !hourSets.endSet.has(end) || !(Number(end) > Number(start))) {
      setEnd("");
    }
  }, [action, hourSets.endSet, end, start]);

  function toggleDay(day: number) {
    setDays((prev) => {
      const n = new Set(prev);
      if (n.has(day)) n.delete(day);
      else n.add(day);
      return n;
    });
  }

  const eventFormComplete =
    !!eventSubjectId &&
    enrolledTargets.length > 0 &&
    days.size > 0 &&
    start !== "" &&
    end !== "" &&
    Number(end) > Number(start) &&
    eventHourSets.startSet.size > 0 &&
    eventHourSets.startSet.has(start) &&
    eventHourSets.endSet.has(end) &&
    (eventSlotDuration == null || slotDurationMin(Number(start), Number(end)) <= eventSlotDuration);

  const eventFormTouched =
    !!eventSubjectId || days.size > 0 || start !== "" || end !== "";

  const canSave =
    targets.length > 0 &&
    (
      (action === "availability" && (pendingAvail.length > 0 || pendingRemoveAvail.size > 0)) ||
      (action === "block" && (pendingBlocks.length > 0 || pendingRemoveBlocks.size > 0)) ||
      (action === "event" && (pendingRemoveEvents.size > 0 || eventFormComplete))
    );

  /** Avisos solo si el formulario está a medias o hay un problema concreto; vacío = sin mensaje. */
  function formErr(): string {
    if (action === "availability" || action === "block") return "";

    // event
    if (pendingRemoveEvents.size > 0) return "";
    if (!eventFormTouched) return "";
    if (targets.length === 0) return "Selecciona a quién afecta";
    if (!eventSubjectId) return "Selecciona una asignatura";
    if (enrolledTargets.length === 0) return "Ningún alumno seleccionado está inscrito en esa asignatura";
    if (days.size === 0) return "Selecciona al menos un día";
    if (start === "" || end === "") return "Selecciona hora de inicio y fin";
    if (!(Number(end) > Number(start))) return "La hora de fin debe ser posterior a la de inicio";
    if (eventHourSets.startSet.size === 0) return "No hay hueco libre (sin choques) para ese día";
    if (eventSlotDuration != null && slotDurationMin(Number(start), Number(end)) > eventSlotDuration) {
      return `La franja no puede superar ${eventSlotDuration} min`;
    }
    return "";
  }
  const err = formErr();

  function blockedConflictMessage(range: TimeRange, forTargets = targets): string | null {
    for (const st of forTargets) {
      if (slotOverlapsBlocked(range.day, range.start, range.end, effectiveBlocked(st))) {
        return `La franja ${fmtDayRange(range.day, range.start, range.end)} choca con un bloqueo de ${st.name}`;
      }
    }
    return null;
  }

  function addPendingAvailForEachDay() {
    if (targets.length === 0) {
      setAddErr("Selecciona a quién afecta");
      return;
    }
    if (days.size === 0) {
      setAddErr("Selecciona al menos un día");
      return;
    }
    if (start === "" || end === "") {
      setAddErr("Selecciona hora de inicio y fin");
      return;
    }
    const s = Number(start);
    const e = Number(end);
    if (!(e > s)) {
      setAddErr("La hora de fin debe ser posterior a la de inicio");
      return;
    }
    if (manageHourSets.startSet.size === 0) {
      setAddErr("No hay horas libres (sin bloqueos) para los días seleccionados");
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

  function addPendingBlocksForEachDay() {
    if (targets.length === 0) {
      setAddErr("Selecciona a quién afecta");
      return;
    }
    if (days.size === 0) {
      setAddErr("Selecciona al menos un día");
      return;
    }
    if (start === "" || end === "") {
      setAddErr("Selecciona hora de inicio y fin");
      return;
    }
    const s = Number(start);
    const e = Number(end);
    if (!(e > s)) {
      setAddErr("La hora de fin debe ser posterior a la de inicio");
      return;
    }
    if (manageHourSets.startSet.size === 0) {
      setAddErr("No hay huecos libres: chocan con otros bloqueos");
      return;
    }
    const title = blockTitle.trim();
    const toAdd: TimeRange[] = [];
    for (const day of days) {
      const range: TimeRange = { day, start: s, end: e, ...(title ? { title } : {}) };
      const dupPending = pendingBlocks.some((r) => r.day === day && r.end > s && r.start < e);
      if (dupPending) continue;
      const conflict = blockedConflictMessage(range);
      if (conflict) {
        setAddErr(conflict);
        return;
      }
      toAdd.push(range);
    }
    if (toAdd.length === 0) {
      setAddErr("Ese bloqueo ya está en la lista");
      return;
    }
    setAddErr("");
    setPendingBlocks((cur) => [...cur, ...toAdd].sort((a, b) => a.day - b.day || a.start - b.start));
  }

  function removePendingAvail(target: TimeRange) {
    setPendingAvail((cur) =>
      cur.filter((r) => !(r.day === target.day && r.start === target.start && r.end === target.end))
    );
  }

  function removePendingBlock(target: TimeRange) {
    setPendingBlocks((cur) =>
      cur.filter((r) => !(r.day === target.day && r.start === target.start && r.end === target.end))
    );
  }

  async function handleSubmit() {
    if (err || busy) return;
    setSubmitting(true);
    try {
      if (action === "availability") {
        for (const r of pendingAvail) {
          const conflict = blockedConflictMessage(r);
          if (conflict) {
            setAddErr(conflict);
            return;
          }
        }
        const removes: { student: Student; ranges: TimeRange[] }[] = [];
        const availByStudent = new Map<number, { student: Student; ranges: TimeRange[] }>();
        for (const row of existingAvailability) {
          if (!pendingRemoveAvail.has(availRemoveKey(row.student.id, row.range))) continue;
          const cur = availByStudent.get(row.student.id) ?? { student: row.student, ranges: [] };
          cur.ranges.push(row.range);
          availByStudent.set(row.student.id, cur);
        }
        for (const row of availByStudent.values()) removes.push(row);
        const ok = await onApplyAvailability({
          removes,
          targets,
          adds: pendingAvail,
        });
        if (!ok) return;
        setPendingAvail([]);
        setPendingRemoveAvail(new Set());
        onOpenChange(false);
      } else if (action === "block") {
        for (const r of pendingBlocks) {
          const conflict = blockedConflictMessage(r);
          if (conflict) {
            setAddErr(conflict);
            return;
          }
        }
        const removes: { student: Student; indices: number[] }[] = [];
        const blockByStudent = new Map<number, { student: Student; indices: number[] }>();
        for (const row of existingBlocks) {
          if (!pendingRemoveBlocks.has(blockRemoveKey(row.student.id, row.index))) continue;
          const cur = blockByStudent.get(row.student.id) ?? { student: row.student, indices: [] };
          cur.indices.push(row.index);
          blockByStudent.set(row.student.id, cur);
        }
        for (const row of blockByStudent.values()) removes.push(row);
        const ok = await onApplyBlocks({
          removes,
          targets,
          adds: pendingBlocks,
        });
        if (!ok) return;
        setPendingBlocks([]);
        setPendingRemoveBlocks(new Set());
        onOpenChange(false);
      } else if (pendingRemoveEvents.size > 0) {
        const ok = await onApplyEvents({ removeIds: [...pendingRemoveEvents] });
        if (!ok) return;
        setPendingRemoveEvents(new Set());
        onOpenChange(false);
      } else {
        const subjectId = Number(eventSubjectId);
        const ok = await onApplyEvents({
          removeIds: [],
          create: {
            targets: enrolledTargets,
            subjectId,
            days: [...days],
            start: Number(start),
            endForStudent: (st) => {
              const maxDur = durationForStudent(st);
              const requested = Number(end);
              if (maxDur == null) return requested;
              const maxEnd = endHourFromDuration(Number(start), maxDur);
              return Math.min(requested, maxEnd);
            },
          },
        });
        if (!ok) return;
        onOpenChange(false);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
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
                Añadir o modificar clase
              </button>
              <button type="button" onClick={() => setAction("availability")} className={`chip ${action === "availability" ? "chip-active" : ""}`}>
                Añadir o modificar disponibilidad
              </button>
              <button type="button" onClick={() => setAction("block")} className={`chip ${action === "block" ? "chip-active" : ""}`}>
                Añadir o modificar bloqueos
              </button>
            </div>
          </div>

          <TargetPicker
            targetMode={targetMode}
            onTargetModeChange={setTargetMode}
            students={students}
            grades={grades}
            studentId={studentId}
            onStudentIdChange={setStudentId}
            grade={grade}
            onGradeChange={setGrade}
            group={group}
            onGroupChange={setGroup}
            targets={targets}
          />

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
                  Máximo: {fmtDurationMin(eventSlotDuration)}
                  {selectedSubject.isCollective ? " · sesión compartida" : ""}
                  {" · "}puedes crear varias clases más cortas hasta cubrirlo
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

          {targets.length > 0 && action === "availability" && existingAvailability.length > 0 && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 space-y-2">
              <p className="text-sm font-medium text-emerald-950">Disponibilidad actual</p>
              <ul className="space-y-1.5 max-h-[28dvh] overflow-y-auto">
                {existingAvailability.map((row) => {
                  const key = availRemoveKey(row.student.id, row.range);
                  const marked = pendingRemoveAvail.has(key);
                  return (
                  <li
                    key={row.key}
                    className={`flex items-center gap-2 rounded-lg border border-emerald-200/80 bg-white px-3 py-2 ${marked ? "opacity-50" : ""}`}
                  >
                    <div className={`min-w-0 flex-1 ${marked ? "line-through" : ""}`}>
                      <p className="text-sm font-medium text-emerald-950 truncate">
                        {fmtDayRange(row.range.day, row.range.start, row.range.end)}
                      </p>
                      {showStudentName && (
                        <p className="text-xs text-emerald-800/70 truncate">{row.student.name}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setPendingRemoveAvail((prev) => toggleKey(prev, key))}
                      className="inline-flex items-center justify-center w-8 h-8 rounded-full text-red-600 hover:bg-red-50"
                      aria-label={marked ? "Deshacer quitar" : "Quitar"}
                    >
                      <X size={14} />
                    </button>
                  </li>
                  );
                })}
              </ul>
            </div>
          )}

          {targets.length > 0 && action === "block" && existingBlocks.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50/60 p-3 space-y-2">
              <p className="text-sm font-medium text-red-950">Bloqueos actuales</p>
              <ul className="space-y-1.5 max-h-[28dvh] overflow-y-auto">
                {existingBlocks.map((row) => {
                  const key = blockRemoveKey(row.student.id, row.index);
                  const marked = pendingRemoveBlocks.has(key);
                  return (
                  <li
                    key={row.key}
                    className={`flex items-center gap-2 rounded-lg border border-red-200/80 bg-white px-3 py-2 ${marked ? "opacity-50" : ""}`}
                  >
                    <div className={`min-w-0 flex-1 ${marked ? "line-through" : ""}`}>
                      <p className="text-sm font-medium text-red-950 truncate">
                        {row.range.title?.trim() ? `${row.range.title.trim()} · ` : ""}
                        {fmtDayRange(row.range.day, row.range.start, row.range.end)}
                      </p>
                      {showStudentName && (
                        <p className="text-xs text-red-800/70 truncate">{row.student.name}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setPendingRemoveBlocks((prev) => toggleKey(prev, key))}
                      className="inline-flex items-center justify-center w-8 h-8 rounded-full text-red-600 hover:bg-red-50"
                      aria-label={marked ? "Deshacer quitar" : "Quitar"}
                    >
                      <X size={14} />
                    </button>
                  </li>
                  );
                })}
              </ul>
            </div>
          )}

          {targets.length > 0 && action === "event" && existingEvents.length > 0 && (
            <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-3 space-y-2">
              <p className="text-sm font-medium text-blue-950">Clases actuales</p>
              <ul className="space-y-1.5 max-h-[28dvh] overflow-y-auto">
                {existingEvents.map((row) => {
                  const marked = pendingRemoveEvents.has(row.assignmentId);
                  return (
                  <li
                    key={row.key}
                    className={`flex items-center gap-2 rounded-lg border border-blue-200/80 bg-white px-3 py-2 ${marked ? "opacity-50" : ""}`}
                  >
                    <div className={`min-w-0 flex-1 ${marked ? "line-through" : ""}`}>
                      <p className="text-sm font-medium text-blue-950 truncate">{row.title}</p>
                      <p className="text-xs text-blue-800/70 truncate">
                        {fmtDayRange(row.day, row.start, row.end)}
                        {row.subtitle ? ` · ${row.subtitle}` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPendingRemoveEvents((prev) => toggleId(prev, row.assignmentId))}
                      className="inline-flex items-center justify-center w-8 h-8 rounded-full text-red-600 hover:bg-red-50"
                      aria-label={marked ? "Deshacer quitar" : "Quitar"}
                    >
                      <X size={14} />
                    </button>
                  </li>
                  );
                })}
              </ul>
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

          {action === "block" && pendingBlocks.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {pendingBlocks.map((r, i) => (
                <span key={i} className="inline-flex items-center gap-1 text-xs bg-red-50 text-red-800 border border-red-200 rounded-full pl-2.5 pr-1 py-0.5">
                  {r.title?.trim() ? `${r.title.trim()} · ` : ""}{fmtDayRange(r.day, r.start, r.end)}
                  <button type="button" onClick={() => removePendingBlock(r)} className="inline-flex items-center justify-center w-5 h-5 rounded-full hover:bg-red-100" aria-label="Quitar">
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
          )}

          <ScheduleSlotForm
            action={action}
            blockTitle={blockTitle}
            onBlockTitleChange={setBlockTitle}
            days={days}
            onToggleDay={toggleDay}
            start={start}
            onStartChange={setStart}
            end={end}
            onEndChange={setEnd}
            hourSets={hourSets}
            eventSlotDuration={eventSlotDuration}
            onAddAvailability={addPendingAvailForEachDay}
            onAddBlocks={addPendingBlocksForEachDay}
          />

          {action === "event" && pendingRemoveEvents.size === 0 && (
            <p className="text-xs text-gray-500">
              Pueden estar fuera de la disponibilidad; no pueden solapar otras clases, bloqueos o reservas.
            </p>
          )}

          {action === "block" && (
            <p className="text-xs text-gray-500">
              Pueden estar fuera de la disponibilidad; no pueden solapar otros bloqueos.
            </p>
          )}

          {action === "availability" && (
            <p className="text-xs text-gray-500">
              Solo horas libres, sin bloqueos. Las clases ya puestas no se mueven al auto-agendar.
            </p>
          )}

          {(addErr || err) && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {addErr || err}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            <X size={14} /> Cancelar
          </Button>
          <Button onClick={handleSubmit} loading={busy} disabled={!canSave || !!err || !!addErr}>
            {action === "event" && pendingRemoveEvents.size > 0 ? (
              <><Save size={14} /> Guardar ({pendingRemoveEvents.size})</>
            ) : action === "event" ? (
              <><CalendarPlus size={14} /> Crear clase</>
            ) : action === "availability" ? (
              <><Save size={14} /> Guardar{(pendingAvail.length + pendingRemoveAvail.size) > 0 ? ` (${pendingAvail.length + pendingRemoveAvail.size})` : ""}</>
            ) : (
              <><Ban size={14} /> Guardar{(pendingBlocks.length + pendingRemoveBlocks.size) > 0 ? ` (${pendingBlocks.length + pendingRemoveBlocks.size})` : ""}</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
