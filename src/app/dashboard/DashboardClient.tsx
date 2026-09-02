"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Briefcase, Trash2, Save, Sparkles, Play, CalendarClock,
} from "lucide-react";
import WeekGrid, { type WeekBlock } from "@/components/WeekGrid";
import AutoScheduleResultDialog, { type AutoScheduleResult } from "@/components/AutoScheduleResultDialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { useToast } from "@/components/Toast";
import PageHeader from "@/components/PageHeader";
import { WeekGridSkeleton } from "@/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { DAYS } from "@/lib/validate";
import { fmtHour, fmtRange, hourOptions, endHourFromDuration, fmtDurationMin, resolveMemberDurationMin, SCHEDULE_DAY_START, SCHEDULE_DAY_END } from "@/lib/hours";
import { firstAvailabilityBlockedConflict, getAssignmentEffectiveRanges, getSlotHourSetsFromRanges, normalizeRanges, validateSlotRequest, type TimeRange } from "@/lib/studentAvailability";
import TeacherScheduleManageDialog from "@/components/TeacherScheduleManageDialog";
import { invalidate, invalidateMany, put, warmData } from "@/lib/clientCache";

const COLORS = ["#2563eb", "#1d4ed8", "#0891b2", "#4f46e5", "#0284c7", "#7c3aed", "#0e7490", "#4338ca"];
const HOURS_START = hourOptions(8, 23);
const HOURS_END = hourOptions(9, 24);

interface Teacher { id: number; name: string; email?: string | null; scheduleFixed?: boolean; }
interface Subject {
  id: number; name: string; teacherId: number; defaultDurationMin: number;
  isCollective?: boolean; scheduleFixed?: boolean;
}
interface TeacherBlock { id: number; teacherId: number; title: string; dayOfWeek: number; startHour: number; endHour: number; }
interface Availability { id: number; teacherId: number; dayOfWeek: number; startHour: number; endHour: number; }
interface Student {
  id: number;
  name: string;
  availableRanges?: TimeRange[];
  blockedRanges?: TimeRange[];
}
interface SubjectStudent {
  subjectId: number;
  studentId: number;
  durationMin: number | null;
}
interface Assignment {
  id: number; teacherId: number; subjectId: number; studentId: number;
  dayOfWeek: number; startHour: number; endHour: number; origin: string;
  collectiveSessionId?: string | null;
  student: { id: number; name: string };
  subject: { id: number; name: string; isCollective?: boolean };
}

function readDashboardCache() {
  const teachers = warmData<Teacher[]>("/api/teachers");
  const subs = warmData<Subject[]>("/api/subjects");
  const asg = warmData<Assignment[]>("/api/assignments");
  const tb = warmData<TeacherBlock[]>("/api/teacher_blocks");
  const av = warmData<Availability[]>("/api/availabilities");
  if (!teachers || !subs || !asg || !tb || !av) return null;
  return {
    teacher: teachers[0] ?? null,
    subjects: subs,
    assignments: asg,
    teacherBlocks: tb,
    availabilities: av,
  };
}

export default function DashboardClient() {
  const toast = useToast();

  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [selectedCollectiveSession, setSelectedCollectiveSession] = useState<Assignment[] | null>(null);
  const [teacherBlocks, setTeacherBlocks] = useState<TeacherBlock[]>([]);
  const [availabilities, setAvailabilities] = useState<Availability[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [subjectStudents, setSubjectStudents] = useState<SubjectStudent[]>([]);
  const [confirmTb, setConfirmTb] = useState<TeacherBlock | null>(null);
  const [confirmDeleteAsg, setConfirmDeleteAsg] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [autoResult, setAutoResult] = useState<AutoScheduleResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const [editAsgDay, setEditAsgDay] = useState("0");
  const [editAsgStart, setEditAsgStart] = useState("");
  const [editAsgEnd, setEditAsgEnd] = useState("");

  function hydrateFromCache(): boolean {
    const cached = readDashboardCache();
    if (!cached) return false;
    setTeacher(cached.teacher);
    setSubjects(cached.subjects);
    setAssignments(cached.assignments);
    setTeacherBlocks(cached.teacherBlocks);
    setAvailabilities(cached.availabilities);
    return true;
  }

  async function load() {
    const hadCache = hydrateFromCache();
    if (hadCache) setLoading(false);
    try {
      const [teachers, subs, asg, tb, av, sts, ss] = await Promise.all([
        fetch("/api/teachers").then((r) => r.json()) as Promise<Teacher[]>,
        fetch("/api/subjects").then((r) => r.json()) as Promise<Subject[]>,
        fetch("/api/assignments").then((r) => r.json()) as Promise<Assignment[]>,
        fetch("/api/teacher_blocks").then((r) => r.json()) as Promise<TeacherBlock[]>,
        fetch("/api/availabilities").then((r) => r.json()) as Promise<Availability[]>,
        fetch("/api/students").then((r) => r.json()) as Promise<Student[]>,
        fetch("/api/subject_students").then((r) => r.json()) as Promise<SubjectStudent[]>,
      ]);
      setTeacher(teachers[0] ?? null);
      setSubjects(subs);
      setAssignments(asg);
      setTeacherBlocks(tb);
      setAvailabilities(av);
      setStudents(sts);
      setSubjectStudents(ss);
      put("/api/teachers", teachers);
      put("/api/subjects", subs);
      put("/api/assignments", asg);
      put("/api/teacher_blocks", tb);
      put("/api/availabilities", av);
      put("/api/students", sts);
      put("/api/subject_students", ss);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const subjectColor: Record<number, string> = useMemo(() => {
    const m: Record<number, string> = {};
    let ci = 0;
    for (const s of subjects) m[s.id] = COLORS[ci++ % COLORS.length];
    return m;
  }, [subjects]);

  const subjectNames: Record<number, string> = useMemo(() => {
    const m: Record<number, string> = {};
    for (const s of subjects) m[s.id] = s.name;
    return m;
  }, [subjects]);

  function memberFor(subjectId: number, studentId: number) {
    return subjectStudents.find((ss) => ss.subjectId === subjectId && ss.studentId === studentId) ?? null;
  }

  function assignmentDurationMin(target: Assignment, collective: Assignment[] | null): number | null {
    const subj = subjects.find((s) => s.id === target.subjectId);
    if (!subj) return null;
    if (collective) return subj.defaultDurationMin;
    return resolveMemberDurationMin(subj, memberFor(target.subjectId, target.studentId));
  }

  function studentsForAssignment(target: Assignment, collective: Assignment[] | null): Student[] {
    const ids = collective ? collective.map((a) => a.studentId) : [target.studentId];
    return ids.map((id) => students.find((s) => s.id === id)).filter((s): s is Student => s != null);
  }

  const editTarget = selectedCollectiveSession?.[0] ?? selectedAssignment;
  const editDurationMin = editTarget ? assignmentDurationMin(editTarget, selectedCollectiveSession) : null;

  const editHourSets = useMemo(() => {
    if (!editTarget) return { startSet: new Set<string>(), endSet: new Set<string>() };
    const day = Number(editAsgDay);
    const slotStudents = studentsForAssignment(editTarget, selectedCollectiveSession).map((st) => ({
      available: normalizeRanges(st.availableRanges),
      blocked: normalizeRanges(st.blockedRanges),
    }));
    const ranges = getAssignmentEffectiveRanges(day, availabilities, slotStudents);
    return getSlotHourSetsFromRanges(ranges, HOURS_START, HOURS_END, editAsgStart, editDurationMin ?? undefined);
  }, [editTarget, selectedCollectiveSession, editAsgDay, editAsgStart, editDurationMin, availabilities, students]);

  function hourItem(o: { value: string; label: string }, allowed: Set<string>) {
    if (!allowed.has(o.value)) return null;
    return <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>;
  }

  const blockBlocks: WeekBlock[] = useMemo(() => teacherBlocks.map((b) => ({
    id: 1000000 + b.id,
    dayOfWeek: b.dayOfWeek,
    startHour: b.startHour,
    endHour: b.endHour,
    title: b.title,
    subtitle: "evento",
    color: "#475569",
    detailTitle: b.title,
    details: [
      { label: "Tipo", value: "Evento" },
      { label: "Día", value: DAYS[b.dayOfWeek] },
      { label: "Horario", value: fmtRange(b.startHour, b.endHour) },
    ],
  })), [teacherBlocks]);

  const assignmentBlocks: WeekBlock[] = useMemo(() => {
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
  }, [assignments, subjectColor, subjectNames, subjects, subjectStudents]);

  const blocks: WeekBlock[] = useMemo(
    () => [...blockBlocks, ...assignmentBlocks],
    [blockBlocks, assignmentBlocks],
  );

  const legend = useMemo(
    () => subjects.map((s) => ({ label: s.name, color: subjectColor[s.id] ?? "#2563eb" })),
    [subjects, subjectColor],
  );

  async function autoScheduleSubjects(subjectIds?: number[]) {
    setBusy(true); setAutoResult(null);
    const res = await fetch("/api/auto_schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subjectIds?.length ? { subjectIds } : {}),
    });
    setBusy(false);
    if (!res.ok) return toast("error", (await res.json().catch(() => ({}))).error || "No se pudo guardar");
    const data: AutoScheduleResult = await res.json();
    setAutoResult(data);
    const skipped = data.skipped?.length ?? 0;
    toast("success", `Auto-agendar: ${data.assigned.length} colocados, ${data.unassigned.length} sin colocar${skipped ? `, ${skipped} omitidas` : ""}`);
    invalidateMany(["/api/assignments", "/api/subject_students"]);
    await load();
  }

  async function deleteAssignment() {
    const target = selectedCollectiveSession?.[0] ?? selectedAssignment;
    if (!target) return;
    const res = await fetch(`/api/assignments?id=${target.id}`, { method: "DELETE" });
    setConfirmDeleteAsg(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast("error", d.error || "Error al borrar");
    } else {
      toast("success", selectedCollectiveSession ? "Sesión colectiva borrada" : "Asignación borrada");
    }
    setSelectedAssignment(null);
    setSelectedCollectiveSession(null);
    invalidate("/api/assignments");
    await load();
  }

  async function saveAvailabilityBatch(ranges: TimeRange[]) {
    const blocked = teacherBlocks.map((b) => ({
      day: b.dayOfWeek,
      start: b.startHour,
      end: b.endHour,
    }));
    const conflict = firstAvailabilityBlockedConflict(ranges, blocked);
    if (conflict) {
      return toast("error", `La franja choca con un evento existente`);
    }
    setBusy(true);
    let saved = 0;
    for (const r of ranges) {
      const res = await fetch("/api/availabilities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dayOfWeek: r.day, startHour: r.start, endHour: r.end }),
      });
      if (!res.ok) {
        setBusy(false);
        toast("error", (await res.json().catch(() => ({}))).error || "No se pudo guardar");
        if (saved > 0) {
          invalidate("/api/availabilities");
          await load();
        }
        return;
      }
      saved++;
    }
    setBusy(false);
    toast("success", saved === 1 ? "Disponibilidad añadida" : `${saved} franjas añadidas`);
    invalidate("/api/availabilities");
    await load();
  }

  async function saveBlockBatch(days: number[], start: number, end: number, title: string) {
    setBusy(true);
    let saved = 0;
    for (const day of days) {
      const dupBlock = teacherBlocks.some(
        (b) => b.dayOfWeek === day && end > b.startHour && start < b.endHour
      );
      const dupAsg = assignments.some(
        (a) => a.dayOfWeek === day && end > a.startHour && start < a.endHour
      );
      if (dupBlock || dupAsg) continue;
      const res = await fetch("/api/teacher_blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          dayOfWeek: day,
          startHour: start,
          endHour: end,
        }),
      });
      if (!res.ok) {
        setBusy(false);
        return toast("error", (await res.json().catch(() => ({}))).error || "No se pudo guardar");
      }
      saved++;
    }
    setBusy(false);
    if (saved === 0) return toast("error", "Ese horario ya tiene un evento o clase");
    toast("success", saved === 1 ? "Evento añadido" : `${saved} eventos añadidos`);
    invalidate("/api/teacher_blocks");
    await load();
  }

  async function removeAvailability(id: number) {
    const res = await fetch(`/api/availabilities?id=${id}`, { method: "DELETE" });
    if (!res.ok) return toast("error", "No se pudo quitar la franja");
    toast("success", "Franja quitada");
    invalidate("/api/availabilities");
    await load();
  }

  async function removeBlock(id: number) {
    const res = await fetch(`/api/teacher_blocks?id=${id}`, { method: "DELETE" });
    if (!res.ok) return toast("error", "No se pudo quitar");
    toast("success", "Evento quitado");
    invalidate("/api/teacher_blocks");
    await load();
  }

  async function confirmDeleteTb() {
    if (!confirmTb) return;
    await removeBlock(confirmTb.id);
    setConfirmTb(null);
  }

  useEffect(() => {
    const target = selectedCollectiveSession?.[0] ?? selectedAssignment;
    if (!target) return;
    const dur = assignmentDurationMin(target, selectedCollectiveSession);
    const day = String(target.dayOfWeek);
    const slotStudents = studentsForAssignment(target, selectedCollectiveSession).map((st) => ({
      available: normalizeRanges(st.availableRanges),
      blocked: normalizeRanges(st.blockedRanges),
    }));
    const ranges = getAssignmentEffectiveRanges(target.dayOfWeek, availabilities, slotStudents);
    const { startSet } = getSlotHourSetsFromRanges(
      ranges,
      HOURS_START,
      HOURS_END,
      String(target.startHour),
      dur ?? undefined,
    );
    const start = startSet.has(String(target.startHour))
      ? String(target.startHour)
      : Array.from(startSet)[0] ?? String(target.startHour);
    setEditAsgDay(day);
    setEditAsgStart(start);
    if (dur != null) {
      setEditAsgEnd(String(endHourFromDuration(Number(start), dur)));
    } else {
      setEditAsgEnd(String(target.endHour));
    }
  }, [selectedAssignment, selectedCollectiveSession, subjects, subjectStudents, availabilities, students]);

  useEffect(() => {
    const target = selectedCollectiveSession?.[0] ?? selectedAssignment;
    if (!target || editAsgStart === "") return;
    const dur = assignmentDurationMin(target, selectedCollectiveSession);
    if (dur == null) return;
    setEditAsgEnd(String(endHourFromDuration(Number(editAsgStart), dur)));
  }, [editAsgStart, selectedAssignment, selectedCollectiveSession, subjects, subjectStudents]);

  useEffect(() => {
    if (!editTarget || editHourSets.startSet.size === 0) return;
    if (!editHourSets.startSet.has(editAsgStart)) {
      setEditAsgStart(Array.from(editHourSets.startSet)[0]);
    }
  }, [editAsgDay, editTarget, editHourSets.startSet, editAsgStart]);

  async function saveEditAsg() {
    const target = selectedCollectiveSession?.[0] ?? selectedAssignment;
    if (!target) return;
    const day = Number(editAsgDay);
    const start = Number(editAsgStart);
    const end = Number(editAsgEnd);
    const slotStudents = studentsForAssignment(target, selectedCollectiveSession);
    const slotErr = (() => {
      for (const st of slotStudents) {
        const err = validateSlotRequest({
          day,
          start,
          end,
          teacherAvails: availabilities,
          studentAvailable: normalizeRanges(st.availableRanges),
          studentBlocked: normalizeRanges(st.blockedRanges),
          requiredDurationMin: editDurationMin ?? undefined,
        });
        if (err) return st.name ? `${st.name}: ${err}` : err;
      }
      return null;
    })();
    if (slotErr) return toast("error", slotErr);

    const body: Record<string, number> = { id: target.id };
    if (day !== target.dayOfWeek) body.dayOfWeek = day;
    if (start !== target.startHour) body.startHour = start;
    if (end !== target.endHour) body.endHour = end;
    if (Object.keys(body).length === 1) {
      setSelectedAssignment(null);
      setSelectedCollectiveSession(null);
      return;
    }
    const res = await fetch("/api/assignments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return toast("error", (await res.json().catch(() => ({}))).error || "No se pudo guardar");
    toast("success", selectedCollectiveSession ? "Sesión colectiva movida" : "Clase movida");
    setSelectedAssignment(null);
    setSelectedCollectiveSession(null);
    invalidate("/api/assignments");
    await load();
  }

  return (
    <div className="dashboard-stack">
      <PageHeader
        icon={Briefcase}
        title={loading ? <Skeleton className="inline-block h-7 w-40 align-middle" /> : (teacher?.name ?? "—")}
        description="Clases, disponibilidad y eventos."
        actions={
          <>
            <Button variant="outline" onClick={() => setManageOpen(true)}>
              <CalendarClock size={16} />
              <span className="sm:hidden">Horario</span>
              <span className="hidden sm:inline">Gestionar horario</span>
            </Button>
            {!loading && !teacher?.scheduleFixed && (
              <Button
                onClick={() => autoScheduleSubjects()}
                disabled={busy || loading}
                title="Auto-agenda todas las asignaturas no fijadas"
              >
                {busy ? (
                  <><Play size={16} /> Ejecutando…</>
                ) : (
                  <>
                    <Sparkles size={16} />
                    <span className="sm:hidden">Auto-agendar</span>
                    <span className="hidden sm:inline">Auto-agendar todo</span>
                  </>
                )}
              </Button>
            )}
          </>
        }
      />

      <AutoScheduleResultDialog
        result={autoResult}
        onClose={() => setAutoResult(null)}
        subjectColors={subjectColor}
      />

      {loading ? (
        <WeekGridSkeleton />
      ) : (
        <WeekGrid
          blocks={blocks}
          startH={SCHEDULE_DAY_START}
          endH={SCHEDULE_DAY_END}
          expandMobile
          allowFullscreen
          onBlockClick={(b) => {
            if (b.id >= 1000000) {
              const blk = teacherBlocks.find((x) => 1000000 + x.id === b.id);
              if (blk) setConfirmTb(blk);
              return;
            }
            const a = assignments.find((x) => x.id === b.id);
            if (!a) return;
            if (a.collectiveSessionId) {
              const group = assignments.filter((x) => x.collectiveSessionId === a.collectiveSessionId);
              setSelectedCollectiveSession(group);
              setSelectedAssignment(null);
            } else {
              setSelectedAssignment(a);
              setSelectedCollectiveSession(null);
            }
          }}
          showLegend
          legend={legend}
        />
      )}

      <Dialog open={selectedAssignment != null || selectedCollectiveSession != null} onOpenChange={(o) => { if (!o) { setSelectedAssignment(null); setSelectedCollectiveSession(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedCollectiveSession ? "Sesión colectiva" : "Detalle de asignación"}
            </DialogTitle>
          </DialogHeader>
          {(selectedAssignment || selectedCollectiveSession) && (() => {
            const target = selectedCollectiveSession?.[0] ?? selectedAssignment!;
            const dur = assignmentDurationMin(target, selectedCollectiveSession);
            return (
            <div className="space-y-3 text-sm">
              <dl className="space-y-2">
                <div className="flex justify-between gap-2"><dt className="text-gray-500 shrink-0">Asignatura</dt><dd className="font-medium text-right truncate max-w-[58%]">{target.subject?.name ?? `#${target.subjectId}`}</dd></div>
                {dur != null && (
                  <div className="flex justify-between"><dt className="text-gray-500">Duración</dt><dd className="font-medium">{fmtDurationMin(dur)}</dd></div>
                )}
                {selectedCollectiveSession ? (
                  <div>
                    <dt className="text-gray-500 mb-1">Alumnos ({selectedCollectiveSession.length})</dt>
                    <dd className="flex flex-wrap gap-1">
                      {selectedCollectiveSession.map((a) => (
                        <Badge key={a.id}>{a.student?.name ?? `#${a.studentId}`}</Badge>
                      ))}
                    </dd>
                  </div>
                ) : (
                  <div className="flex justify-between gap-2"><dt className="text-gray-500 shrink-0">Alumno</dt><dd className="font-medium text-right truncate max-w-[58%]">{target.student?.name ?? `#${target.studentId}`}</dd></div>
                )}
              </dl>
              <div className="divider" />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <Label htmlFor="tb-1">Día</Label>
                  <Select value={editAsgDay} onValueChange={setEditAsgDay}>
                    <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                    <SelectContent>
                      {DAYS.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="tb-2">Hora de inicio</Label>
                  <Select value={editAsgStart} onValueChange={setEditAsgStart}>
                    <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                    <SelectContent>
                      {HOURS_START.map((o) => hourItem(o, editHourSets.startSet))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="tb-3">Hora de fin</Label>
                  <div className="flex h-9 items-center rounded-md border border-gray-200 bg-gray-50 px-3 text-sm tabular-nums">
                    {editAsgEnd !== "" ? fmtHour(editAsgEnd) : "—"}
                  </div>
                </div>
              </div>
              {editHourSets.startSet.size === 0 && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  No hay franjas disponibles en común entre tu horario y el del alumno para este día.
                </p>
              )}
              {dur != null && (
                <p className="text-xs text-gray-500">
                  La hora de fin se calcula según la duración de la asignatura para {selectedCollectiveSession ? "la sesión colectiva" : "este alumno"} ({fmtDurationMin(dur)}).
                  {selectedCollectiveSession ? " Al mover o borrar, se aplica a todos los alumnos." : ""}
                </p>
              )}
            </div>
            );
          })()}
          <div className="mt-5 border-t border-gray-100 pt-4">
            <Button
              className="w-full"
              onClick={saveEditAsg}
              disabled={editHourSets.startSet.size === 0}
            >
              <Save size={14} /> Guardar cambios
            </Button>
            <div className="mt-5 flex justify-center border-t border-dashed border-gray-200 pt-4">
              <button
                type="button"
                onClick={() => setConfirmDeleteAsg(true)}
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors"
              >
                <Trash2 size={13} aria-hidden />
                {selectedCollectiveSession ? "Eliminar sesión colectiva" : "Eliminar asignación"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <TeacherScheduleManageDialog
        open={manageOpen}
        onOpenChange={setManageOpen}
        availabilities={availabilities}
        teacherBlocks={teacherBlocks}
        assignments={assignments}
        saving={busy}
        onSaveAvailability={saveAvailabilityBatch}
        onSaveBlock={saveBlockBatch}
        onRemoveAvailability={removeAvailability}
        onRemoveBlock={removeBlock}
      />

      <AlertDialog open={confirmDeleteAsg} onOpenChange={setConfirmDeleteAsg}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {selectedCollectiveSession ? "Eliminar sesión colectiva" : "Eliminar asignación"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const target = selectedCollectiveSession?.[0] ?? selectedAssignment;
                if (!target) return null;
                const slot = `${DAYS[target.dayOfWeek]} ${fmtRange(target.startHour, target.endHour)}`;
                const subjectName = target.subject?.name ?? `#${target.subjectId}`;
                if (selectedCollectiveSession) {
                  return (
                    <>
                      ¿Eliminar sesión de <strong>{subjectName}</strong> el {slot} ({selectedCollectiveSession.length} alumno
                      {selectedCollectiveSession.length !== 1 ? "s" : ""})?
                    </>
                  );
                }
                const studentName = target.student?.name ?? `#${target.studentId}`;
                return (
                  <>
                    ¿Eliminar <strong>{subjectName}</strong> con <strong>{studentName}</strong> el {slot}?
                  </>
                );
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={deleteAssignment}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmTb != null} onOpenChange={(o) => { if (!o) setConfirmTb(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Quitar evento</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmTb ? `¿Quitar el evento "${confirmTb.title}" del ${DAYS[confirmTb.dayOfWeek]} ${fmtRange(confirmTb.startHour, confirmTb.endHour)}?` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteTb}>Quitar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
