"use client";

import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Save, X, GraduationCap, Calendar, CalendarDays, Mail, Search } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useToast } from "@/components/Toast";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import FloatingActionButton from "@/components/FloatingActionButton";
import { TableCardSkeleton } from "@/components/skeletons";
import { warmData, put, invalidate, invalidateMany, hasFreshAll, STUDENTS_ENDPOINTS, fetchApi, onCacheStale } from "@/lib/clientCache";
import { SCHEDULE_LOCK_CHANGED_EVENT } from "@/lib/useTeacherProfile";
import { fmtDayRange, SCHEDULE_HOURS_START, SCHEDULE_HOURS_END } from "@/lib/hours";
import { DAYS } from "@/lib/validate";
import StudentScheduleViewDialog from "@/components/StudentScheduleViewDialog";
import StudentScheduleManageDialog from "@/components/StudentScheduleManageDialog";
import StudentsCalendarDialog from "@/components/StudentsCalendarDialog";
import { carveAvailabilityAroundBlocked, isExternalClass, type TimeRange } from "@/lib/studentAvailability";

interface Subject { id: number; name: string; defaultDurationMin: number; isCollective?: boolean; }
interface Student {
  id: number;
  name: string;
  email?: string | null;
  grade?: string | null;
  blockedRanges?: TimeRange[];
  availableRanges?: TimeRange[];
}
interface SSRow { id: number; subjectId: number; studentId: number; durationMin?: number | null; }
interface Availability { dayOfWeek: number; startHour: number; endHour: number; }
interface TeacherBlock { dayOfWeek: number; startHour: number; endHour: number; }
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

function getInitialStudentsState() {
  const empty = {
    students: null as Student[] | null,
    subjects: [] as Subject[],
    subjectLinks: [] as SSRow[],
    availabilities: [] as Availability[],
    teacherBlocks: [] as TeacherBlock[],
    assignments: [] as Assignment[],
    scheduleLocked: false,
  };
  const cachedStudents = warmData<Student[]>("/api/students");
  if (cachedStudents === null) return empty;
  const cachedTeachers = warmData<{ scheduleFixed?: boolean }[]>("/api/teachers");
  return {
    students: cachedStudents,
    subjects: warmData<Subject[]>("/api/subjects") ?? [],
    subjectLinks: warmData<SSRow[]>("/api/subject_students") ?? [],
    availabilities: warmData<Availability[]>("/api/availabilities") ?? [],
    teacherBlocks: warmData<TeacherBlock[]>("/api/teacher_blocks") ?? [],
    assignments: warmData<Assignment[]>("/api/assignments") ?? [],
    scheduleLocked: Boolean(cachedTeachers?.[0]?.scheduleFixed),
  };
}

export default function StudentsClient() {
  const toast = useToast();
  const [initial] = useState(getInitialStudentsState);
  const [students, setStudents] = useState(initial.students);
  const [subjects, setSubjects] = useState(initial.subjects);
  const [subjectLinks, setSubjectLinks] = useState(initial.subjectLinks);
  const [availabilities, setAvailabilities] = useState(initial.availabilities);
  const [teacherBlocks, setTeacherBlocks] = useState(initial.teacherBlocks);
  const [assignments, setAssignments] = useState(initial.assignments);

  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [fName, setFName] = useState("");
  const [fGrade, setFGrade] = useState("");
  const [fEmail, setFEmail] = useState("");
  const [selSubjects, setSelSubjects] = useState<Set<number>>(new Set());
  const [initialSubjects, setInitialSubjects] = useState<Set<number>>(new Set());
  const [editRemoveAvail, setEditRemoveAvail] = useState<Set<number>>(new Set());
  const [editAvailEdits, setEditAvailEdits] = useState<Record<number, TimeRange>>({});
  const [availEditIndex, setAvailEditIndex] = useState<number | null>(null);
  const [editRemoveBlocks, setEditRemoveBlocks] = useState<Set<number>>(new Set());
  const [editRemoveEvents, setEditRemoveEvents] = useState<Set<number>>(new Set());
  const [editBlockedEdits, setEditBlockedEdits] = useState<Record<number, TimeRange>>({});
  const [editEventEdits, setEditEventEdits] = useState<
    Record<number, { dayOfWeek: number; startHour: number; endHour: number }>
  >({});
  const [blockedEditIndex, setBlockedEditIndex] = useState<number | null>(null);
  const [eventEditId, setEventEditId] = useState<number | null>(null);

  const [viewOpen, setViewOpen] = useState(false);
  const [viewStudent, setViewStudent] = useState<Student | null>(null);

  const [manageOpen, setManageOpen] = useState(false);
  const [manageStudentId, setManageStudentId] = useState<number | null>(null);
  const [allBlocksOpen, setAllBlocksOpen] = useState(false);
  const [calendarInitialView, setCalendarInitialView] = useState<"blocks" | "events">("blocks");

  const [confirmDel, setConfirmDel] = useState<Student | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [scheduleLocked, setScheduleLocked] = useState(initial.scheduleLocked);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  async function load(opts: { force?: boolean } = {}) {
    const cachedStudents = warmData<Student[]>("/api/students");
    if (cachedStudents !== null) {
      setStudents(cachedStudents);
      setSubjects(warmData<Subject[]>("/api/subjects") ?? []);
      setSubjectLinks(warmData<SSRow[]>("/api/subject_students") ?? []);
      setAvailabilities(warmData<Availability[]>("/api/availabilities") ?? []);
      setTeacherBlocks(warmData<TeacherBlock[]>("/api/teacher_blocks") ?? []);
      setAssignments(warmData<Assignment[]>("/api/assignments") ?? []);
      const cachedTeachers = warmData<{ scheduleFixed?: boolean }[]>("/api/teachers");
      if (cachedTeachers) setScheduleLocked(Boolean(cachedTeachers[0]?.scheduleFixed));
    }

    if (!opts.force && hasFreshAll(STUDENTS_ENDPOINTS)) {
      return;
    }

    const [st, su, ss, av, tb, asg, teachers] = await Promise.all([
      fetchApi<Student[]>("/api/students"),
      fetchApi<Subject[]>("/api/subjects"),
      fetchApi<SSRow[]>("/api/subject_students"),
      fetchApi<Availability[]>("/api/availabilities"),
      fetchApi<TeacherBlock[]>("/api/teacher_blocks"),
      fetchApi<Assignment[]>("/api/assignments"),
      fetchApi<{ scheduleFixed?: boolean }[]>("/api/teachers"),
    ]);
    if (st) {
      setStudents(st);
      put("/api/students", st);
    }
    if (su) {
      setSubjects(su);
      put("/api/subjects", su);
    }
    if (ss) {
      setSubjectLinks(ss);
      put("/api/subject_students", ss);
    }
    if (av) {
      setAvailabilities(av);
      put("/api/availabilities", av);
    }
    if (tb) {
      setTeacherBlocks(tb);
      put("/api/teacher_blocks", tb);
    }
    if (asg) {
      setAssignments(asg);
      put("/api/assignments", asg);
    }
    if (teachers) {
      setScheduleLocked(Boolean(teachers[0]?.scheduleFixed));
      put("/api/teachers", teachers);
    }
  }

  useLayoutEffect(() => {
    if (students !== null) return;
    const cachedStudents = warmData<Student[]>("/api/students");
    if (cachedStudents === null) return;
    setStudents(cachedStudents);
    setSubjects(warmData<Subject[]>("/api/subjects") ?? []);
    setSubjectLinks(warmData<SSRow[]>("/api/subject_students") ?? []);
    setAvailabilities(warmData<Availability[]>("/api/availabilities") ?? []);
    setTeacherBlocks(warmData<TeacherBlock[]>("/api/teacher_blocks") ?? []);
    setAssignments(warmData<Assignment[]>("/api/assignments") ?? []);
    const cachedTeachers = warmData<{ scheduleFixed?: boolean }[]>("/api/teachers");
    if (cachedTeachers) setScheduleLocked(Boolean(cachedTeachers[0]?.scheduleFixed));
  }, [students]);

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    const onLock = () => { void load({ force: true }); };
    const offStale = onCacheStale(() => { void load({ force: true }); });
    window.addEventListener(SCHEDULE_LOCK_CHANGED_EVENT, onLock);
    return () => {
      window.removeEventListener(SCHEDULE_LOCK_CHANGED_EVENT, onLock);
      offStale();
    };
  }, []);

  const grades = useMemo(
    () => Array.from(new Set((students ?? []).map((s) => (s.grade ?? "").trim()).filter(Boolean))).sort(),
    [students]
  );

  const filteredStudents = useMemo(() => {
    const list = students ?? [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter((s) =>
      s.name.toLowerCase().includes(q)
      || (s.email ?? "").toLowerCase().includes(q)
      || (s.grade ?? "").toLowerCase().includes(q),
    );
  }, [students, searchQuery]);

  function openNew() {
    setEditing(null);
    setFName(""); setFGrade(""); setFEmail("");
    setSelSubjects(new Set());
    setInitialSubjects(new Set());
    setEditRemoveAvail(new Set());
    setEditAvailEdits({});
    setAvailEditIndex(null);
    setEditRemoveBlocks(new Set());
    setEditRemoveEvents(new Set());
    setEditBlockedEdits({});
    setEditEventEdits({});
    setBlockedEditIndex(null);
    setEventEditId(null);
    setEditOpen(true);
  }

  function openEdit(s: Student) {
    setEditing(s);
    setFName(s.name); setFGrade(s.grade ?? ""); setFEmail(s.email ?? "");
    const subs = new Set(
      subjectLinks.filter((r) => r.studentId === s.id).map((r) => r.subjectId),
    );
    setSelSubjects(subs);
    setInitialSubjects(subs);
    setEditRemoveAvail(new Set());
    setEditAvailEdits({});
    setAvailEditIndex(null);
    setEditRemoveBlocks(new Set());
    setEditRemoveEvents(new Set());
    setEditBlockedEdits({});
    setEditEventEdits({});
    setBlockedEditIndex(null);
    setEventEditId(null);
    setEditOpen(true);
  }

  function openScheduleView(s: Student) {
    setViewStudent(s);
    setViewOpen(true);
  }


  function subjectsEqual(a: Set<number>, b: Set<number>) {
    if (a.size !== b.size) return false;
    for (const id of a) if (!b.has(id)) return false;
    return true;
  }

  function toggleSub(id: number) {
    setSelSubjects((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  async function updateStudentRanges(
    st: Student,
    patch: { availableRanges?: TimeRange[]; blockedRanges?: TimeRange[] }
  ): Promise<boolean> {
    const res = await fetch("/api/students", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: st.id,
        name: st.name,
        email: st.email ?? "",
        grade: st.grade ?? "",
        ...patch,
      }),
    });
    return res.ok;
  }

  async function applyAvailabilityChanges(args: {
    removes: { student: Student; ranges: TimeRange[] }[];
    targets: Student[];
    adds: TimeRange[];
  }): Promise<boolean> {
    setSaving(true);
    let removed = 0;
    let addedStudents = 0;
    try {
      const blockedAfterRemove = new Map<number, TimeRange[]>();
      const availableAfterRemove = new Map<number, TimeRange[]>();

      for (const { student, ranges } of args.removes) {
        if (ranges.length === 0) continue;
        const drop = new Set(ranges.map((r) => `${r.day}:${r.start}:${r.end}`));
        const nextAvail = (student.availableRanges ?? []).filter(
          (r) => !drop.has(`${r.day}:${r.start}:${r.end}`),
        );
        const ok = await updateStudentRanges(student, { availableRanges: nextAvail });
        if (!ok) {
          toast("error", "No se pudo quitar la franja");
          return false;
        }
        removed += ranges.length;
        availableAfterRemove.set(student.id, nextAvail);
        blockedAfterRemove.set(student.id, student.blockedRanges ?? []);
      }

      if (args.adds.length > 0) {
        for (const st of args.targets) {
          const cur = availableAfterRemove.get(st.id) ?? st.availableRanges ?? [];
          const blocked = blockedAfterRemove.get(st.id) ?? st.blockedRanges ?? [];
          const carved = carveAvailabilityAroundBlocked([...cur, ...args.adds], blocked);
          const changed =
            carved.length !== cur.length ||
            carved.some((r, i) => !cur[i] || r.day !== cur[i].day || r.start !== cur[i].start || r.end !== cur[i].end);
          if (!changed) continue;
          const ok = await updateStudentRanges(st, { availableRanges: carved });
          if (!ok) {
            toast("error", "No se pudo guardar la disponibilidad");
            return false;
          }
          addedStudents++;
        }
      }

      const parts: string[] = [];
      if (removed > 0) parts.push(removed === 1 ? "1 franja quitada" : `${removed} franjas quitadas`);
      if (addedStudents > 0) {
        parts.push(
          addedStudents === 1
            ? "disponibilidad añadida"
            : `disponibilidad añadida a ${addedStudents} alumno(s)`,
        );
      }
      toast(
        "success",
        parts.length === 0
          ? "Cambios guardados"
          : parts.map((p, i) => (i === 0 ? p.charAt(0).toUpperCase() + p.slice(1) : p)).join(" y "),
      );
      invalidate("/api/students");
      void load({ force: true });
      return true;
    } finally {
      setSaving(false);
    }
  }

  async function applyBlockChanges(args: {
    removes: { student: Student; indices: number[] }[];
    targets: Student[];
    adds: TimeRange[];
  }): Promise<boolean> {
    setSaving(true);
    let removed = 0;
    let addedStudents = 0;
    try {
      const blockedAfterRemove = new Map<number, TimeRange[]>();
      const availableAfterRemove = new Map<number, TimeRange[]>();

      for (const { student, indices } of args.removes) {
        if (indices.length === 0) continue;
        const drop = new Set(indices);
        const nextBlocked = (student.blockedRanges ?? []).filter((_, i) => !drop.has(i));
        const ok = await updateStudentRanges(student, { blockedRanges: nextBlocked });
        if (!ok) {
          toast("error", "No se pudo quitar el bloqueo");
          return false;
        }
        removed += indices.length;
        blockedAfterRemove.set(student.id, nextBlocked);
        availableAfterRemove.set(student.id, student.availableRanges ?? []);
      }

      if (args.adds.length > 0) {
        for (const st of args.targets) {
          const cur = blockedAfterRemove.get(st.id) ?? st.blockedRanges ?? [];
          const toAdd: TimeRange[] = [];
          for (const r of args.adds) {
            const title = r.title?.trim();
            const dup =
              cur.some((b) => b.day === r.day && r.end > b.start && r.start < b.end) ||
              toAdd.some((b) => b.day === r.day && r.end > b.start && r.start < b.end);
            if (!dup) {
              toAdd.push({
                day: r.day,
                start: r.start,
                end: r.end,
                kind: r.kind === "class" ? "class" : "block",
                ...(title ? { title } : {}),
              });
            }
          }
          if (toAdd.length === 0) continue;
          const nextBlocked = [...cur, ...toAdd];
          const baseAvail = availableAfterRemove.get(st.id) ?? st.availableRanges ?? [];
          const nextAvailable = carveAvailabilityAroundBlocked(baseAvail, nextBlocked);
          const ok = await updateStudentRanges(st, {
            blockedRanges: nextBlocked,
            availableRanges: nextAvailable,
          });
          if (!ok) {
            toast("error", "No se pudo guardar el bloqueo");
            return false;
          }
          addedStudents++;
        }
      }

      const parts: string[] = [];
      if (removed > 0) parts.push(removed === 1 ? "1 bloqueo quitado" : `${removed} bloqueos quitados`);
      if (addedStudents > 0) {
        parts.push(
          addedStudents === 1
            ? "bloqueo añadido"
            : `bloqueos añadidos (${addedStudents} alumno(s))`,
        );
      }
      toast(
        "success",
        parts.length === 0
          ? "Cambios guardados"
          : parts.map((p, i) => (i === 0 ? p.charAt(0).toUpperCase() + p.slice(1) : p)).join(" y "),
      );
      invalidate("/api/students");
      void load({ force: true });
      return true;
    } finally {
      setSaving(false);
    }
  }

  async function applyEventChanges(args: {
    removeIds: number[];
    create?: {
      targets: Student[];
      subjectId: number;
      days: number[];
      start: number;
      endForStudent: (student: Student) => number;
    };
  }): Promise<boolean> {
    setSaving(true);
    let removed = 0;
    let created = 0;
    try {
      for (const id of args.removeIds) {
        const res = await fetch(`/api/assignments?id=${id}`, { method: "DELETE" });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          toast("error", d.error || "No se pudo eliminar la clase");
          return false;
        }
        removed++;
      }

      if (args.create) {
        const { targets, subjectId, days, start, endForStudent } = args.create;
        const subj = subjects.find((s) => s.id === subjectId);
        if (!subj) {
          toast("error", "Asignatura no encontrada");
          return false;
        }
        if (targets.length === 0) {
          toast("error", "No hay alumnos seleccionados");
          return false;
        }
        for (const day of days) {
          const sessionId = subj.isCollective && targets.length > 1 ? crypto.randomUUID() : null;
          for (const st of targets) {
            const end = endForStudent(st);
            const res = await fetch("/api/assignments", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                subjectId,
                studentId: st.id,
                dayOfWeek: day,
                startHour: start,
                endHour: end,
                collectiveSessionId: sessionId,
              }),
            });
            if (!res.ok) {
              const d = await res.json().catch(() => ({}));
              toast("error", d.error || `No se pudo crear la clase de ${st.name}`);
              return false;
            }
            created++;
          }
        }
      }

      const parts: string[] = [];
      if (removed > 0) parts.push(removed === 1 ? "1 clase eliminada" : `${removed} clases eliminadas`);
      if (created > 0) parts.push(created === 1 ? "clase creada" : `${created} clases creadas`);
      toast(
        "success",
        parts.length === 0
          ? "Cambios guardados"
          : parts.map((p, i) => (i === 0 ? p.charAt(0).toUpperCase() + p.slice(1) : p)).join(" y "),
      );
      invalidateMany(["/api/assignments", "/api/subject_students", "/api/students"]);
      void load({ force: true });
      return true;
    } finally {
      setSaving(false);
    }
  }

  async function saveStudent() {
    if (!fName.trim()) return toast("error", "Falta el nombre");
    const noRangeRemovals =
      editRemoveAvail.size === 0 &&
      editRemoveBlocks.size === 0 &&
      editRemoveEvents.size === 0;
    const noAvailEdits = Object.keys(editAvailEdits).length === 0;
    const noBlockedEdits = Object.keys(editBlockedEdits).length === 0;
    const noEventEdits = Object.keys(editEventEdits).length === 0;
    if (
      editing &&
      fName.trim() === editing.name &&
      fGrade.trim() === (editing.grade ?? "") &&
      fEmail.trim() === (editing.email ?? "") &&
      subjectsEqual(selSubjects, initialSubjects) &&
      noRangeRemovals &&
      noAvailEdits &&
      noBlockedEdits &&
      noEventEdits
    ) {
      setEditOpen(false);
      return;
    }
    setSaving(true);
    const payload: Record<string, unknown> = { name: fName.trim(), grade: fGrade.trim(), email: fEmail.trim() };
    if (editing) payload.id = editing.id;
    const res = await fetch("/api/students", {
      method: editing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      setSaving(false);
      return toast("error", (await res.json().catch(() => ({}))).error || "Error al guardar los datos del alumno");
    }
    const saved: Student = await res.json();
    const rows = subjectLinks.filter((r) => r.studentId === saved.id);
    for (const sub of subjects) {
      const row = rows.find((r) => r.subjectId === sub.id);
      const want = selSubjects.has(sub.id);
      if (want && !row) {
        const linkRes = await fetch("/api/subject_students", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subjectId: sub.id, studentId: saved.id }),
        });
        if (!linkRes.ok) {
          setSaving(false);
          return toast("error", (await linkRes.json().catch(() => ({}))).error || `No se pudo añadir a ${sub.name}`);
        }
      } else if (!want && row) {
        const delRes = await fetch(`/api/subject_students?id=${row.id}`, { method: "DELETE" });
        if (!delRes.ok) {
          setSaving(false);
          return toast("error", (await delRes.json().catch(() => ({}))).error || `No se pudo quitar de ${sub.name}`);
        }
      }
    }
    if (editing) {
      const fresh = (students ?? []).find((x) => x.id === editing.id) ?? editing;
      const curAvail = fresh.availableRanges ?? [];
      const curBlocks = fresh.blockedRanges ?? [];
      const nextAvail: TimeRange[] = [];
      for (let i = 0; i < curAvail.length; i++) {
        if (editRemoveAvail.has(i)) continue;
        nextAvail.push(editAvailEdits[i] ?? curAvail[i]);
      }
      const nextBlocks: TimeRange[] = [];
      for (let i = 0; i < curBlocks.length; i++) {
        if (editRemoveBlocks.has(i)) continue;
        nextBlocks.push(editBlockedEdits[i] ?? curBlocks[i]);
      }

      const availChanged = nextAvail.length !== curAvail.length || editRemoveAvail.size > 0 || Object.keys(editAvailEdits).length > 0 || nextAvail.some((r, i) => {
        const c = curAvail[i];
        return !c || c.day !== r.day || c.start !== r.start || c.end !== r.end;
      });
      const blocksChanged = nextBlocks.length !== curBlocks.length || nextBlocks.some((r, i) => {
        const c = curBlocks.filter((_, idx) => !editRemoveBlocks.has(idx))[i];
        return !c || c.day !== r.day || c.start !== r.start || c.end !== r.end || (c.kind ?? "block") !== (r.kind ?? "block") || (c.title ?? "") !== (r.title ?? "");
      });

      if (availChanged || blocksChanged) {
        const ok = await updateStudentRanges(fresh, {
          availableRanges: availChanged ? nextAvail : undefined,
          blockedRanges: blocksChanged ? nextBlocks : undefined,
        } as { availableRanges?: TimeRange[]; blockedRanges?: TimeRange[] });
        if (!ok) {
          setSaving(false);
          return toast("error", "No se pudieron guardar los cambios de disponibilidad u ocupaciones del alumno");
        }
      }

      // Borrar clases/ocupaciones por tipo de clase (asignaciones) antes de parchear ediciones.
      for (const id of editRemoveEvents) {
        const resDel = await fetch(`/api/assignments?id=${id}`, { method: "DELETE" });
        if (!resDel.ok) {
          setSaving(false);
          return toast("error", "No se pudo eliminar la clase del alumno. Inténtalo de nuevo.");
        }
      }

      for (const [k, v] of Object.entries(editEventEdits)) {
        const id = Number(k);
        if (!Number.isFinite(id) || editRemoveEvents.has(id)) continue;
        const resPatch = await fetch("/api/assignments", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id,
            dayOfWeek: v.dayOfWeek,
            startHour: v.startHour,
            endHour: v.endHour,
          }),
        });
        if (!resPatch.ok) {
          setSaving(false);
          const d = await resPatch.json().catch(() => ({}));
          return toast("error", d.error || "No se pudo modificar una clase");
        }
      }
    }
    // Capturar valores para el toast ANTES de resetear estados
    const _availRemoved = editRemoveAvail.size;
    const _availEditsCount = Object.keys(editAvailEdits).map(Number).filter((i) => !editRemoveAvail.has(i)).length;
    const _blocksRemoved = editRemoveBlocks.size;
    const _eventsRemoved = editRemoveEvents.size;
    const _blockedEditsCount = Object.keys(editBlockedEdits).map(Number).filter((i) => !editRemoveBlocks.has(i)).length;
    const _eventsEditsCount = Object.keys(editEventEdits).map(Number).filter((id) => !editRemoveEvents.has(id)).length;
    const _nameChanged = editing ? fName.trim() !== editing.name : false;
    const _gradeChanged = editing ? fGrade.trim() !== (editing.grade ?? "") : false;
    const _emailChanged = editing ? fEmail.trim() !== (editing.email ?? "") : false;
    const _subjectsChanged = !subjectsEqual(selSubjects, initialSubjects);

    setSaving(false);
    setEditOpen(false);
    setEditRemoveAvail(new Set());
    setEditAvailEdits({});
    setAvailEditIndex(null);
    setEditRemoveBlocks(new Set());
    setEditRemoveEvents(new Set());
    setEditBlockedEdits({});
    setEditEventEdits({});
    setBlockedEditIndex(null);
    setEventEditId(null);

    if (editing) {
      const parts: string[] = [];
      if (_nameChanged || _gradeChanged || _emailChanged) parts.push("Datos del alumno actualizados");
      if (_subjectsChanged) parts.push("Matrícula actualizada");
      if (_availRemoved > 0) parts.push(_availRemoved === 1 ? "1 franja de disponibilidad quitada" : `${_availRemoved} franjas de disponibilidad quitadas`);
      if (_availEditsCount > 0) parts.push(_availEditsCount === 1 ? "1 franja de disponibilidad modificada" : `${_availEditsCount} franjas de disponibilidad modificadas`);
      if (_blocksRemoved > 0) parts.push(_blocksRemoved === 1 ? "1 ocupación quitada" : `${_blocksRemoved} ocupaciones quitadas`);
      if (_blockedEditsCount > 0) parts.push(_blockedEditsCount === 1 ? "1 ocupación modificada" : `${_blockedEditsCount} ocupaciones modificadas`);
      if (_eventsRemoved > 0) parts.push(_eventsRemoved === 1 ? "1 clase eliminada" : `${_eventsRemoved} clases eliminadas`);
      if (_eventsEditsCount > 0) parts.push(_eventsEditsCount === 1 ? "1 clase modificada" : `${_eventsEditsCount} clases modificadas`);
      toast("success", parts.length === 0 ? "Cambios guardados" : parts.join(" · "));
    } else {
      toast("success", "Alumno creado");
    }
    invalidateMany(["/api/students", "/api/subject_students", "/api/subjects", "/api/assignments"]);
    void load({ force: true });
  }

  async function doDelete() {
    if (!confirmDel || deleting) return;
    setDeleting(true);
    const res = await fetch(`/api/students?id=${confirmDel.id}`, { method: "DELETE" });
    setDeleting(false);
    setConfirmDel(null);
    if (!res.ok) return toast("error", "No se pudo borrar el alumno. Puede que tenga clases asignadas.");
    invalidate("/api/students"); invalidate("/api/subject_students"); toast("success", "Alumno borrado");
    void load({ force: true });
  }

  const viewStudentFresh = viewStudent
    ? (students ?? []).find((s) => s.id === viewStudent.id) ?? viewStudent
    : null;

  return (
    <div className="page-stack">
      <PageHeader
        icon={GraduationCap}
        title="Alumnos"
        description="Gestiona tus alumnos."
        actions={
          <>
            <Button
              variant={searchOpen ? "default" : "outline"}
              onClick={() => {
                setSearchOpen((v) => {
                  if (v) setSearchQuery("");
                  return !v;
                });
              }}
              aria-expanded={searchOpen}
              aria-controls="students-search-input"
            >
              <Search size={16} />
              <span className="hidden sm:inline">Buscar</span>
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                if ((students ?? []).length === 0) return toast("error", "No hay alumnos todavía");
                setCalendarInitialView("blocks");
                setAllBlocksOpen(true);
              }}
            >
              <CalendarDays size={16} />
              <span className="sm:hidden">Calendario</span>
              <span className="hidden sm:inline">Ver calendarios</span>
            </Button>
            
          </>
        }
      />

      {searchOpen && (
        <div className="students-search-bar">
          <div className="students-search-input-wrap">
            <Input
              id="students-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por nombre, email o curso…"
              autoFocus
            />
          </div>
        </div>
      )}

      {students === null ? (
        <TableCardSkeleton rows={5} />
      ) : students.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="No hay alumnos aún"
          description="Añade tu primer alumno para gestionar disponibilidad y horarios."
          {...(!scheduleLocked ? {
            actionLabel: "Añadir primer alumno",
            onAction: openNew,
          } : {})}
        />
      ) : filteredStudents.length === 0 ? (
        <EmptyState
          icon={Search}
          title="Sin resultados"
          description={`Ningún alumno coincide con «${searchQuery.trim()}».`}
          actionLabel="Limpiar búsqueda"
          onAction={() => { setSearchQuery(""); setSearchOpen(false); }}
        />
      ) : (
        <div className="entity-list entity-list-stacked">
          {filteredStudents.map((s) => (
            <article key={s.id} className="entity-card">
              <div className="entity-card-header">
                <div className="min-w-0 flex-1">
                  <h3 className="entity-card-title">{s.name}</h3>
                  <div className="entity-card-meta">
                    {s.grade ? (
                      <Badge variant="gray" className="font-normal">{s.grade}</Badge>
                    ) : (
                      <span className="text-xs text-gray-400">Sin curso</span>
                    )}
                    {s.email ? (
                      <span className="inline-flex items-center gap-1 text-xs text-gray-500 min-w-0">
                        <Mail size={12} className="shrink-0" />
                        <span className="truncate">{s.email}</span>
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="entity-card-actions">
                  <Button size="iconSm" variant="outline" onClick={() => openScheduleView(s)} aria-label="Ver calendario" title="Ver calendario">
                    <Calendar size={14} />
                  </Button>
                  {!scheduleLocked && (
                    <>
                      <Button size="iconSm" variant="outline" onClick={() => { setManageStudentId(s.id); setManageOpen(true); }} aria-label="Añadir al horario" title="Añadir al horario">
                        <Plus size={14} />
                      </Button>
                      <Button size="iconSm" variant="outline" onClick={() => openEdit(s)} aria-label="Editar alumno" title="Editar alumno">
                        <Pencil size={14} />
                      </Button>
                      <Button size="iconSm" variant="destructive" onClick={() => setConfirmDel(s)} aria-label="Borrar">
                        <Trash2 size={14} />
                      </Button>
                    </>
                  )}
                </div>
              </div>

              <div className="entity-card-section">
                <div className="entity-card-label">Asignaturas</div>
                <div className="entity-card-chips">
                  <StudentSubjects studentId={s.id} subjects={subjects} links={subjectLinks} />
                </div>
              </div>

              <div className="entity-card-section">
                <div className="entity-card-label">Disponibilidad</div>
                <div className="entity-card-chips">
                  {(s.availableRanges ?? []).length === 0 ? (
                    <span className="text-gray-400 text-xs">Sin definir</span>
                  ) : (
                    (s.availableRanges ?? []).map((b, i) => (
                      <Badge key={i} variant="success" className="font-normal whitespace-normal text-left leading-snug">
                        {fmtDayRange(b.day, b.start, b.end)}
                      </Badge>
                    ))
                  )}
                </div>
              </div>

              <div className="entity-card-section">
                <div className="entity-card-label">Ocupaciones</div>
                <div className="entity-card-chips">
                  {(s.blockedRanges ?? []).length === 0 ? (
                    <span className="text-gray-400 text-xs">Ninguna</span>
                  ) : (
                    (s.blockedRanges ?? []).map((b, i) => (
                      <Badge key={i} variant={isExternalClass(b) ? "gray" : "danger"} className="font-normal whitespace-normal text-left leading-snug">
                        {isExternalClass(b) ? "Clase · " : "Bloqueo · "}
                        {b.title?.trim() ? `${b.title.trim()} · ` : ""}{fmtDayRange(b.day, b.start, b.end)}
                      </Badge>
                    ))
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <Dialog open={editOpen} onOpenChange={(o) => { if (!o) setEditOpen(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar alumno" : "Nuevo alumno"}</DialogTitle>
            {!editing && (
              <DialogDescription>Datos y asignaturas.</DialogDescription>
            )}
          </DialogHeader>
          <div className="space-y-3 overflow-y-auto" style={{ maxHeight: "60dvh" }}>
            <div>
              <Label htmlFor="f-name">Nombre del alumno</Label>
              <Input id="f-name" value={fName} onChange={(e) => setFName(e.target.value)} placeholder="Ej: María Fernández (flauta)" required />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="f-grade">Curso</Label>
                <Input id="f-grade" value={fGrade} onChange={(e) => setFGrade(e.target.value)} placeholder="Ej: 2º Grado Profesional" list="grades-list" />
                <datalist id="grades-list">{grades.map((g) => <option key={g} value={g} />)}</datalist>
              </div>
              <div>
                <Label htmlFor="f-email">Email (opcional)</Label>
                <Input id="f-email" type="text" value={fEmail} onChange={(e) => setFEmail(e.target.value)} placeholder="nombre@ejemplo.com" />
              </div>
            </div>
            <div>
              <Label htmlFor="f-subjects">Asignaturas en las que está matriculado</Label>
              {subjects.length === 0 ? (
                <p className="text-xs text-gray-500">Aún no hay asignaturas.</p>
              ) : (
                <div className="space-y-1.5 mt-1">
                  {subjects.map((sub) => (
                    <label
                      key={sub.id}
                      className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm cursor-pointer transition-colors ${
                        selSubjects.has(sub.id)
                          ? "bg-[#eff6ff] border-[var(--accent)]/40"
                          : "bg-gray-50 border-gray-100"
                      }`}
                    >
                      <Checkbox
                        checked={selSubjects.has(sub.id)}
                        onChange={() => toggleSub(sub.id)}
                      />
                      <span className="font-medium">{sub.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {editing && (
              <>
                <div>
                  <Label>Disponibilidad</Label>
                  {(editing.availableRanges ?? []).length === 0 ? (
                    <p className="text-xs text-gray-500 mt-1">Sin disponibilidad definida.</p>
                  ) : (
                    <div className="space-y-2 mt-2">
                      {(editing.availableRanges ?? []).map((r, i) => {
                        const marked = editRemoveAvail.has(i);
                        const edited = editAvailEdits[i];
                        const shown = edited ?? r;
                        return (
                          <div
                            key={`avail-${i}:${r.day}:${r.start}:${r.end}`}
                            className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${
                              marked
                                ? "opacity-60 line-through border-red-200 bg-red-50"
                                : "border-emerald-200 bg-emerald-50"
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium truncate">
                                {fmtDayRange(shown.day, shown.start, shown.end)}
                              </p>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                type="button"
                                size="iconSm"
                                variant="outline"
                                disabled={marked}
                                onClick={() => setAvailEditIndex(i)}
                                aria-label="Editar"
                                title="Editar"
                              >
                                <Pencil size={14} />
                              </Button>
                              <Button
                                type="button"
                                size="iconSm"
                                variant="destructive"
                                onClick={() => {
                                  setEditRemoveAvail((prev) => {
                                    const n = new Set(prev);
                                    if (n.has(i)) n.delete(i); else n.add(i);
                                    return n;
                                  });
                                  if (!marked) {
                                    setEditAvailEdits((prev) => {
                                      const { [i]: _, ...rest } = prev;
                                      return rest;
                                    });
                                  }
                                }}
                                aria-label={marked ? "Deshacer borrado" : "Borrar"}
                                title={marked ? "Deshacer" : "Borrar"}
                              >
                                <Trash2 size={14} />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div>
                  <Label>Ocupaciones</Label>
                  {(editing.blockedRanges ?? []).length === 0 ? (
                    <p className="text-xs text-gray-500 mt-1">Sin ocupaciones.</p>
                  ) : (
                    <div className="space-y-2 mt-2">
                      {(editing.blockedRanges ?? []).map((r, i) => {
                        const marked = editRemoveBlocks.has(i);
                        const edited = editBlockedEdits[i];
                        const shown = edited ?? r;
                        return (
                          <div
                            key={`${i}:${r.day}:${r.start}:${r.end}:${r.title ?? ""}`}
                            className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${
                              marked
                                ? "opacity-60 line-through border-red-200 bg-red-50"
                                : isExternalClass(shown)
                                  ? "border-gray-200 bg-gray-50"
                                  : "border-red-200 bg-red-50"
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium truncate">
                                {isExternalClass(shown) ? "Clase · " : "Bloqueo · "}
                                {shown.title?.trim() ? `${shown.title.trim()} · ` : ""}
                                {fmtDayRange(shown.day, shown.start, shown.end)}
                              </p>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                type="button"
                                size="iconSm"
                                variant="outline"
                                disabled={marked}
                                onClick={() => setBlockedEditIndex(i)}
                                aria-label="Editar"
                                title="Editar"
                              >
                                <Pencil size={14} />
                              </Button>
                              <Button
                                type="button"
                                size="iconSm"
                                variant="destructive"
                                onClick={() => {
                                  setEditRemoveBlocks((prev) => {
                                    const n = new Set(prev);
                                    if (n.has(i)) n.delete(i);
                                    else n.add(i);
                                    return n;
                                  });
                                  setEditBlockedEdits((prev) => {
                                    if (!marked) {
                                      const { [i]: _, ...rest } = prev;
                                      return rest;
                                    }
                                    return prev;
                                  });
                                }}
                                aria-label={marked ? "Deshacer borrado" : "Borrar"}
                                title={marked ? "Deshacer" : "Borrar"}
                              >
                                <Trash2 size={14} />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div>
                  <Label>Clases en tus asignaturas</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">Las clases colectivas solo pueden editarse desde Asignaturas. Aquí puedes desvincular al alumno.</p>
                  {assignments.filter((a) => a.studentId === editing.id).length === 0 ? (
                    <p className="text-xs text-gray-500 mt-1">Sin clases creadas.</p>
                  ) : (
                    <div className="space-y-2 mt-2">
                      {assignments.filter((a) => a.studentId === editing.id).map((a) => {
                        const marked = editRemoveEvents.has(a.id);
                        const isCollective = !!a.collectiveSessionId;
                        const edited = isCollective ? undefined : editEventEdits[a.id];
                        const shown = edited
                          ? { ...a, dayOfWeek: edited.dayOfWeek, startHour: edited.startHour, endHour: edited.endHour }
                          : a;
                        const subjectName =
                          a.subject?.name ??
                          subjects.find((x) => x.id === a.subjectId)?.name ??
                          "Asignatura";
                        return (
                          <div
                            key={a.id}
                            className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${
                              marked ? "opacity-60 line-through border-red-200 bg-red-50" : "border-blue-200 bg-blue-50"
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium truncate">
                                {subjectName} · {fmtDayRange(shown.dayOfWeek, shown.startHour, shown.endHour)}
                              </p>
                            </div>
                            <div className="flex items-center gap-1">
                              {!isCollective && (
                                <Button
                                  type="button"
                                  size="iconSm"
                                  variant="outline"
                                  disabled={marked}
                                  onClick={() => setEventEditId(a.id)}
                                  aria-label="Editar"
                                  title="Editar"
                                >
                                  <Pencil size={14} />
                                </Button>
                              )}
                              <Button
                                type="button"
                                size="iconSm"
                                variant="destructive"
                                onClick={() => {
                                  setEditRemoveEvents((prev) => {
                                    const n = new Set(prev);
                                    if (n.has(a.id)) n.delete(a.id);
                                    else n.add(a.id);
                                    return n;
                                  });
                                  if (!marked) {
                                    setEditEventEdits((prev) => {
                                      const { [a.id]: _, ...rest } = prev;
                                      return rest;
                                    });
                                  }
                                }}
                                aria-label={marked ? "Deshacer borrado" : "Borrar"}
                                title={marked ? "Deshacer" : "Borrar"}
                              >
                                <Trash2 size={14} />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {availEditIndex != null && editing.availableRanges?.[availEditIndex] && (
                  <AvailabilityEditDialog
                    open={availEditIndex != null}
                    onOpenChange={(o) => { if (!o) setAvailEditIndex(null); }}
                    initial={editAvailEdits[availEditIndex] ?? editing.availableRanges[availEditIndex]}
                    onSave={(next) => {
                      setEditAvailEdits((prev) => ({ ...prev, [availEditIndex]: next }));
                      setEditRemoveAvail((prev) => {
                        const n = new Set(prev);
                        n.delete(availEditIndex);
                        return n;
                      });
                      setAvailEditIndex(null);
                    }}
                  />
                )}

                {blockedEditIndex != null && editing.blockedRanges?.[blockedEditIndex] && (
                  <BlockedRangeEditDialog
                    open={blockedEditIndex != null}
                    onOpenChange={(o) => { if (!o) setBlockedEditIndex(null); }}
                    initial={editBlockedEdits[blockedEditIndex] ?? editing.blockedRanges?.[blockedEditIndex]}
                    onSave={(next) => {
                      setEditBlockedEdits((prev) => ({ ...prev, [blockedEditIndex]: next }));
                      setEditRemoveBlocks((prev) => {
                        const n = new Set(prev);
                        n.delete(blockedEditIndex);
                        return n;
                      });
                      setBlockedEditIndex(null);
                    }}
                  />
                )}

                {eventEditId != null && assignments.find((a) => a.id === eventEditId) && (
                  <AssignmentEditDialog
                    open={eventEditId != null}
                    onOpenChange={(o) => { if (!o) setEventEditId(null); }}
                    assignment={assignments.find((a) => a.id === eventEditId)!}
                    initialEdit={
                      editEventEdits[eventEditId]
                    }
                    subjectName={
                      assignments.find((a) => a.id === eventEditId)?.subject?.name ??
                      subjects.find((x) => x.id === assignments.find((a) => a.id === eventEditId)!.subjectId)?.name ??
                      "Asignatura"
                    }
                    onSave={(next) => {
                      setEditEventEdits((prev) => ({ ...prev, [eventEditId]: next }));
                      setEditRemoveEvents((prev) => {
                        const n = new Set(prev);
                        n.delete(eventEditId);
                        return n;
                      });
                      setEventEditId(null);
                    }}
                  />
                )}
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setEditOpen(false)} disabled={saving}><X size={14} /> Cancelar</Button>
            <Button onClick={saveStudent} loading={saving}><Save size={14} /> {editing ? "Guardar" : "Crear"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <StudentScheduleViewDialog
        open={viewOpen}
        onOpenChange={setViewOpen}
        student={viewStudentFresh}
        subjects={subjects}
        assignments={assignments}
        teacherAvailabilities={availabilities}
      />

      {!scheduleLocked && (
        <StudentScheduleManageDialog
          open={manageOpen}
          onOpenChange={setManageOpen}
          students={students ?? []}
          grades={grades}
          subjects={subjects}
          subjectLinks={subjectLinks}
          teacherBlocks={teacherBlocks}
          assignments={assignments}
          initialStudentId={manageStudentId}
          saving={saving}
          onApplyBlocks={applyBlockChanges}
          onApplyEvents={applyEventChanges}
        />
      )}

      <StudentsCalendarDialog
        open={allBlocksOpen}
        onOpenChange={setAllBlocksOpen}
        students={students ?? []}
        subjects={subjects}
        assignments={assignments}
        initialView={calendarInitialView}
      />

      <AlertDialog open={confirmDel !== null} onOpenChange={(o) => { if (!o && !deleting) setConfirmDel(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar borrado</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Borrar a <strong>{confirmDel?.name}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              loading={deleting}
              onClick={(e) => {
                e.preventDefault();
                void doDelete();
              }}
            >
              Borrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {!scheduleLocked && (
        <FloatingActionButton onClick={openNew} aria-label="Nuevo alumno" />
      )}
    </div>
  );
}

function AvailabilityEditDialog({
  open,
  onOpenChange,
  initial,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: TimeRange;
  onSave: (next: TimeRange) => void;
}) {
  const [day, setDay] = useState(String(initial.day));
  const [start, setStart] = useState(String(initial.start));
  const [end, setEnd] = useState(String(initial.end));
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open) return;
    setDay(String(initial.day));
    setStart(String(initial.start));
    setEnd(String(initial.end));
    setErr("");
  }, [open, initial.day, initial.start, initial.end]);

  const startNum = Number(start);
  const endNum = Number(end);
  const endOptions = SCHEDULE_HOURS_END.filter((o) => Number(o.value) > startNum);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil size={16} className="text-emerald-600" />
            Editar disponibilidad
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 overflow-y-auto" style={{ maxHeight: "55dvh" }}>
          <div>
            <Label>Día</Label>
            <Select value={day} onValueChange={setDay}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAYS.map((d, idx) => (
                  <SelectItem key={idx} value={String(idx)}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Hora inicio</Label>
              <Select value={start || undefined} onValueChange={setStart}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona…" />
                </SelectTrigger>
                <SelectContent>
                  {SCHEDULE_HOURS_START.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Hora fin</Label>
              <Select value={end || undefined} onValueChange={setEnd} disabled={!start || Number.isNaN(startNum)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona…" />
                </SelectTrigger>
                <SelectContent>
                  {endOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {err ? <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{err}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
            <X size={14} /> Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => {
              setErr("");
              if (!Number.isFinite(Number(day))) return;
              if (!Number.isFinite(startNum) || !Number.isFinite(endNum)) {
                setErr("Selecciona inicio y fin válidos");
                return;
              }
              if (!(endNum > startNum)) {
                setErr("La hora de fin debe ser posterior a la de inicio");
                return;
              }
              onSave({ day: Number(day), start: startNum, end: endNum });
            }}
          >
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BlockedRangeEditDialog({
  open,
  onOpenChange,
  initial,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: TimeRange;
  onSave: (next: TimeRange) => void;
}) {
  const [kind, setKind] = useState<"block" | "class">(initial.kind === "class" ? "class" : "block");
  const [title, setTitle] = useState(initial.title ?? "");
  const [day, setDay] = useState(String(initial.day));
  const [start, setStart] = useState(String(initial.start));
  const [end, setEnd] = useState(String(initial.end));
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open) return;
    setKind(initial.kind === "class" ? "class" : "block");
    setTitle(initial.title ?? "");
    setDay(String(initial.day));
    setStart(String(initial.start));
    setEnd(String(initial.end));
    setErr("");
  }, [open, initial.day, initial.start, initial.end, initial.kind, initial.title]);

  const startNum = Number(start);
  const endNum = Number(end);
  const endOptions = SCHEDULE_HOURS_END.filter((o) => Number(o.value) > startNum);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil size={16} className="text-blue-600" />
            Editar ocupación
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 overflow-y-auto" style={{ maxHeight: "55dvh" }}>
          <div>
            <Label>Tipo</Label>
            <Select value={kind} onValueChange={(v) => setKind(v === "class" ? "class" : "block")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="block">Bloqueo</SelectItem>
                <SelectItem value="class">Clase del centro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Nombre (opcional)</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={kind === "class" ? "Ej: Orquesta, Lenguaje…" : "Ej: viaje, médico…"}
            />
          </div>

          <div>
            <Label>Día</Label>
            <Select value={day} onValueChange={setDay}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAYS.map((d, idx) => (
                  <SelectItem key={idx} value={String(idx)}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Hora inicio</Label>
              <Select value={start || undefined} onValueChange={setStart}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona…" />
                </SelectTrigger>
                <SelectContent>
                  {SCHEDULE_HOURS_START.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Hora fin</Label>
              <Select value={end || undefined} onValueChange={setEnd} disabled={!start || Number.isNaN(startNum)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona…" />
                </SelectTrigger>
                <SelectContent>
                  {endOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {err ? <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{err}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
            <X size={14} /> Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => {
              setErr("");
              if (!Number.isFinite(Number(day))) return;
              if (!Number.isFinite(startNum) || !Number.isFinite(endNum)) {
                setErr("Selecciona inicio y fin válidos");
                return;
              }
              if (!(endNum > startNum)) {
                setErr("La hora de fin debe ser posterior a la de inicio");
                return;
              }
              const next: TimeRange = {
                day: Number(day),
                start: startNum,
                end: endNum,
                kind,
                ...(title.trim() ? { title: title.trim() } : {}),
              };
              onSave(next);
            }}
          >
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssignmentEditDialog({
  open,
  onOpenChange,
  assignment,
  initialEdit,
  subjectName,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignment: { id: number; dayOfWeek: number; startHour: number; endHour: number };
  initialEdit?: { dayOfWeek: number; startHour: number; endHour: number };
  subjectName: string;
  onSave: (next: { dayOfWeek: number; startHour: number; endHour: number }) => void;
}) {
  const effective = initialEdit ?? assignment;

  const [day, setDay] = useState(String(effective.dayOfWeek));
  const [start, setStart] = useState(String(effective.startHour));
  const [end, setEnd] = useState(String(effective.endHour));
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open) return;
    setDay(String(effective.dayOfWeek));
    setStart(String(effective.startHour));
    setEnd(String(effective.endHour));
    setErr("");
  }, [open, effective.dayOfWeek, effective.startHour, effective.endHour]);

  const startNum = Number(start);
  const endNum = Number(end);
  const endOptions = SCHEDULE_HOURS_END.filter((o) => Number(o.value) > startNum);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil size={16} className="text-blue-600" />
            Editar clase
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 overflow-y-auto" style={{ maxHeight: "55dvh" }}>
          <div>
            <Label>Asignatura</Label>
            <p className="text-sm text-gray-700 border border-gray-100 bg-gray-50 rounded-lg px-3 py-2">
              {subjectName}
            </p>
          </div>

          <div>
            <Label>Día</Label>
            <Select value={day} onValueChange={setDay}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAYS.map((d, idx) => (
                  <SelectItem key={idx} value={String(idx)}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Hora inicio</Label>
              <Select value={start || undefined} onValueChange={setStart}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona…" />
                </SelectTrigger>
                <SelectContent>
                  {SCHEDULE_HOURS_START.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Hora fin</Label>
              <Select value={end || undefined} onValueChange={setEnd} disabled={!start || Number.isNaN(startNum)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona…" />
                </SelectTrigger>
                <SelectContent>
                  {endOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {err ? <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{err}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
            <X size={14} /> Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => {
              setErr("");
              if (!Number.isFinite(Number(day))) return;
              if (!Number.isFinite(startNum) || !Number.isFinite(endNum)) {
                setErr("Selecciona inicio y fin válidos");
                return;
              }
              if (!(endNum > startNum)) {
                setErr("La hora de fin debe ser posterior a la de inicio");
                return;
              }
              onSave({
                dayOfWeek: Number(day),
                startHour: startNum,
                endHour: endNum,
              });
            }}
          >
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StudentSubjects({
  studentId,
  subjects,
  links,
}: {
  studentId: number;
  subjects: Subject[];
  links: SSRow[];
}) {
  const rows = links.filter((x) => x.studentId === studentId);
  if (rows.length === 0) return <Badge variant="gray">Sin asignaturas</Badge>;
  return (
    <>
      {rows.map((r) => (
        <Badge key={r.id} className="font-normal whitespace-normal text-left leading-snug">
          {subjects.find((x) => x.id === r.subjectId)?.name ?? `#${r.subjectId}`}
        </Badge>
      ))}
    </>
  );
}
