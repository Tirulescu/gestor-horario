"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Plus, Trash2, X, BookOpen, GraduationCap, ClipboardList,
  Pencil, ArrowUp, ArrowDown, Sparkles,
} from "lucide-react";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { AnimatePresence, Reorder } from "motion/react";
import { useToast } from "@/components/Toast";
import { Switch } from "@/components/ui/switch";
import AutoScheduleResultDialog, { type AutoScheduleResult } from "@/components/AutoScheduleResultDialog";
import { fmtDurationMin, collectSubjectDurationOptions, SESSION_PART_MIN, maxSessionParts, MIN_DURATION_MIN, DURATION_STEP_MIN } from "@/lib/hours";
import SubjectDurationBadges from "@/components/SubjectDurationBadges";
import { fetchApi, invalidateMany, onCacheStale, put, subjectGradeKey, warmData, queuePriorityWrite, flushPendingPriorityWrites } from "@/lib/clientCache";
import { SubjectDetailSkeleton } from "@/components/skeletons";
import { COPY } from "@/lib/copy";
import type { ConfirmTarget, GradeDuration, SlotRequest, Student, Subject, SubjectStudent } from "./types";
import { MemberRow } from "./MemberRow";
import type { SessionPartsValue } from "./SessionPartsFields";
import { AddMemberDialog } from "./AddMemberDialog";
import { EditMemberDialog } from "./EditMemberDialog";
import { AddGradeDialog } from "./AddGradeDialog";

export default function SubjectDetailClient({ id }: { id: number }) {
  const toast = useToast();
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [autoResult, setAutoResult] = useState<AutoScheduleResult | null>(null);
  const [autoResultMode, setAutoResultMode] = useState<"preview" | "applied">("preview");

  // member modal
  const [memberOpen, setMemberOpen] = useState(false);
  const [newStudent, setNewStudent] = useState("");
  const [newSlotsRequired, setNewSlotsRequired] = useState("1");
  const [newDurationMin, setNewDurationMin] = useState("");
  const [newSessionParts, setNewSessionParts] = useState<SessionPartsValue>({ split: false, sessionParts: "2" });
  const nextPriorityRef = useRef<number | null>(null);

  // grade modal
  const [gradeOpen, setGradeOpen] = useState(false);
  const [newGrade, setNewGrade] = useState("");
  const [gradeDurationMin, setGradeDurationMin] = useState("30");
  const [gradeSlotsRequired, setGradeSlotsRequired] = useState("1");
  const [gradeSessionParts, setGradeSessionParts] = useState<SessionPartsValue>({ split: false, sessionParts: "2" });

  // edit member modal
  const [editMember, setEditMember] = useState<SubjectStudent | null>(null);
  const [editDuration, setEditDuration] = useState("");
  const [editSlots, setEditSlots] = useState("1");
  const [editSessionParts, setEditSessionParts] = useState<SessionPartsValue>({ split: false, sessionParts: "2" });

  const gradeKey = subjectGradeKey(id);

  function readSubjectDetailCache() {
    const allSubjects = warmData<Subject[]>("/api/subjects");
    const ssAll = warmData<SubjectStudent[]>("/api/subject_students");
    const st = warmData<Student[]>("/api/students");
    const srAll = warmData<SlotRequest[]>("/api/slot_requests");
    if (!allSubjects || !ssAll || !st || !srAll) return null;
    const s = allSubjects.find((x) => x.id === id) ?? null;
    if (!s) return null;
    const teachers = warmData<{ scheduleFixed?: boolean }[]>("/api/teachers");
    return {
      subject: s,
      members: ssAll.filter((x) => x.subjectId === id),
      allStudents: st,
      slotRequests: srAll.filter((x) => x.subjectId === id),
      gradeDurations: warmData<GradeDuration[]>(gradeKey) ?? [],
      teacherScheduleFixed: Boolean(teachers?.[0]?.scheduleFixed),
    };
  }

  function getSubjectDetailBoot() {
    const empty = {
      pending: true,
      subject: null as Subject | null,
      members: [] as SubjectStudent[],
      allStudents: [] as Student[],
      slotRequests: [] as SlotRequest[],
      gradeDurations: [] as GradeDuration[],
      teacherScheduleFixed: false,
    };
    const cached = readSubjectDetailCache();
    if (!cached) return empty;
    return { pending: false, ...cached };
  }

  function hydrateFromCache(): boolean {
    const cached = readSubjectDetailCache();
    if (!cached) return false;
    setSubject(cached.subject);
    setMembers(cached.members);
    setAllStudents(cached.allStudents);
    setSlotRequests(cached.slotRequests);
    setGradeDurations(cached.gradeDurations);
    setTeacherScheduleFixed(cached.teacherScheduleFixed);
    return true;
  }

  const [boot] = useState(getSubjectDetailBoot);
  const [subject, setSubject] = useState(boot.subject);
  const [loading, setLoading] = useState(() => boot.pending);
  const [members, setMembers] = useState(boot.members);
  const [allStudents, setAllStudents] = useState(boot.allStudents);
  const [slotRequests, setSlotRequests] = useState(boot.slotRequests);
  const [gradeDurations, setGradeDurations] = useState(boot.gradeDurations);
  const [teacherScheduleFixed, setTeacherScheduleFixed] = useState(boot.teacherScheduleFixed);

  async function load() {
    if (hydrateFromCache()) {
      setLoading(false);
      if (warmData<GradeDuration[]>(gradeKey) === null) {
        const gd = await fetchApi<GradeDuration[]>(gradeKey);
        if (gd) {
          setGradeDurations(gd);
          put(gradeKey, gd);
        }
      }
      return;
    }
    try {
      const [allSubjects, ssAll, st, srAll, gd, teachers] = await Promise.all([
        fetchApi<Subject[]>("/api/subjects"),
        fetchApi<SubjectStudent[]>("/api/subject_students"),
        fetchApi<Student[]>("/api/students"),
        fetchApi<SlotRequest[]>("/api/slot_requests"),
        fetchApi<GradeDuration[]>(gradeKey),
        fetchApi<{ scheduleFixed?: boolean }[]>("/api/teachers"),
      ]);
      if (allSubjects) {
        const s = allSubjects.find((x) => x.id === id) ?? null;
        setSubject(s);
        put("/api/subjects", allSubjects);
      }
      if (ssAll) {
        setMembers(ssAll.filter((x) => x.subjectId === id));
        put("/api/subject_students", ssAll);
      }
      if (st) {
        setAllStudents(st);
        put("/api/students", st);
      }
      if (srAll) {
        setSlotRequests(srAll.filter((x) => x.subjectId === id));
        put("/api/slot_requests", srAll);
      }
      if (gd) {
        setGradeDurations(gd);
        put(gradeKey, gd);
      }
      if (teachers) {
        setTeacherScheduleFixed(Boolean(teachers[0]?.scheduleFixed));
        put("/api/teachers", teachers);
      }
    } finally {
      setLoading(false);
    }
  }

  /** Recarga silenciosa: no muestra skeleton. */
  async function loadSilent() {
    hydrateFromCache();
    try {
      const [allSubjects, ssAll, st, srAll, gd, teachers] = await Promise.all([
        fetchApi<Subject[]>("/api/subjects"),
        fetchApi<SubjectStudent[]>("/api/subject_students"),
        fetchApi<Student[]>("/api/students"),
        fetchApi<SlotRequest[]>("/api/slot_requests"),
        fetchApi<GradeDuration[]>(gradeKey),
        fetchApi<{ scheduleFixed?: boolean }[]>("/api/teachers"),
      ]);
      if (allSubjects) { setSubject(allSubjects.find((x) => x.id === id) ?? null); put("/api/subjects", allSubjects); }
      if (ssAll) { setMembers(ssAll.filter((x) => x.subjectId === id)); put("/api/subject_students", ssAll); }
      if (st) { setAllStudents(st); put("/api/students", st); }
      if (srAll) { setSlotRequests(srAll.filter((x) => x.subjectId === id)); put("/api/slot_requests", srAll); }
      if (gd) { setGradeDurations(gd); put(gradeKey, gd); }
      if (teachers) { setTeacherScheduleFixed(Boolean(teachers[0]?.scheduleFixed)); put("/api/teachers", teachers); }
    } catch { /* ignore */ }
  }

  useLayoutEffect(() => {
    if (hydrateFromCache()) setLoading(false);
  }, [id]);

  useEffect(() => { void load(); }, [id]);

  useEffect(() => {
    const offStale = onCacheStale(() => { void loadSilent(); });
    return offStale;
  }, [id]);

  const requestsByStudent = useMemo(() => {
    const m: Record<number, SlotRequest[]> = {};
    for (const r of slotRequests) {
      (m[r.studentId] ??= []).push(r);
    }
    for (const k of Object.keys(m)) {
      m[Number(k)].sort((a, b) => a.prefOrder - b.prefOrder || a.id - b.id);
    }
    return m;
  }, [slotRequests]);

  const sortedMembers = useMemo(
    () => [...members].sort((a, b) => a.priority - b.priority || a.id - b.id),
    [members]
  );

  function openAddMember() {
    // La prioridad se asigna sola: el nuevo alumno queda el ULTIMO de la fila.
    nextPriorityRef.current = null;
    setNewStudent("");
    setNewSlotsRequired("1");
    setNewDurationMin("");
    setNewSessionParts({ split: false, sessionParts: "2" });
    setMemberOpen(true);
  }

  async function submitMember() {
    if (saving) return;
    if (!newStudent) return toast("error", "Selecciona un alumno");
    const durationForParts = Number(newDurationMin) || defaultDur;
    const sessionParts = newSessionParts.split ? Number(newSessionParts.sessionParts) : 1;
    if (newSessionParts.split) {
      const maxParts = maxSessionParts(durationForParts);
      if (sessionParts < 2 || sessionParts !== maxParts) {
        return toast("error", `Con ${fmtDurationMin(durationForParts)} debes dividir en ${maxParts} partes de ${SESSION_PART_MIN} min`);
      }
    }
    if (newDurationMin.trim() !== "") {
      const d = Number(newDurationMin);
      if (!d || d < MIN_DURATION_MIN || d % DURATION_STEP_MIN !== 0) {
        return toast("error", `La duración debe ser múltiplo de ${DURATION_STEP_MIN} min (mín. ${MIN_DURATION_MIN})`);
      }
    }
    const payload: Record<string, unknown> = {
      subjectId: id,
      studentId: Number(newStudent),
      slotsRequired: Number(newSlotsRequired),
      sessionParts,
    };
    if (nextPriorityRef.current != null) payload.priority = nextPriorityRef.current;
    if (newDurationMin.trim() !== "") payload.durationMin = Number(newDurationMin);
    setSaving(true);
    const res = await fetch("/api/subject_students", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (!res.ok) return toast("error", (await res.json().catch(() => ({}))).error || "No se pudo guardar");
    const created = (await res.json()) as SubjectStudent;
    const student = allStudents.find((s) => s.id === created.studentId);
    const row: SubjectStudent = {
      ...created,
      student: student ? { id: student.id, name: student.name, grade: student.grade ?? null } : created.student,
    };
    setMembers((cur) => [...cur, row].sort((a, b) => a.priority - b.priority || a.id - b.id));
    const cached = warmData<SubjectStudent[]>("/api/subject_students") ?? [];
    put("/api/subject_students", [...cached.filter((x) => x.id !== row.id), row]);
    toast("success", "Alumno añadido");
    setMemberOpen(false);
  }

  function openEditMember(m: SubjectStudent) {
    setEditMember(m);
    setEditDuration(m.durationMin == null ? "" : String(m.durationMin));
    setEditSlots(String(m.slotsRequired));
    const parts = Math.max(1, m.sessionParts ?? 1);
    setEditSessionParts({
      split: parts > 1,
      sessionParts: String(parts > 1 ? parts : 2),
    });
  }

  async function submitEditMember() {
    if (!editMember || saving) return;
    const durationMin = editDuration.trim() === "" ? null : Number(editDuration);
    const slotsRequired = Number(editSlots);
    const durationForParts = durationMin ?? defaultDur;
    const sessionParts = editSessionParts.split ? Number(editSessionParts.sessionParts) : 1;
    if (editSessionParts.split) {
      const maxParts = maxSessionParts(durationForParts);
      if (sessionParts < 2 || sessionParts !== maxParts) {
        return toast("error", `Con ${fmtDurationMin(durationForParts)} debes dividir en ${maxParts} partes de ${SESSION_PART_MIN} min`);
      }
    }
    if (durationMin != null && (durationMin < MIN_DURATION_MIN || durationMin % DURATION_STEP_MIN !== 0)) {
      return toast("error", `La duración debe ser múltiplo de ${DURATION_STEP_MIN} min (mín. ${MIN_DURATION_MIN})`);
    }
    if (
      slotsRequired === editMember.slotsRequired &&
      durationMin === editMember.durationMin &&
      sessionParts === (editMember.sessionParts ?? 1)
    ) {
      setEditMember(null);
      return;
    }
    const patch: Record<string, unknown> = { slotsRequired, durationMin, sessionParts };
    setSaving(true);
    const res = await fetch("/api/subject_students", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editMember.id, ...patch }),
    });
    setSaving(false);
    if (!res.ok) return toast("error", (await res.json().catch(() => ({}))).error || "No se pudo guardar");
    const updated = (await res.json()) as SubjectStudent;
    setMembers((cur) =>
      cur.map((m) => (m.id === updated.id ? { ...m, ...updated, student: m.student } : m)),
    );
    const cached = warmData<SubjectStudent[]>("/api/subject_students");
    if (cached) {
      put(
        "/api/subject_students",
        cached.map((m) => (m.id === updated.id ? { ...m, ...updated, student: m.student } : m)),
      );
    }
    toast("success", "Alumno actualizado");
    setEditMember(null);
  }

  function applyMemberSwap(memberId: number, dir: "up" | "down") {
    const sorted = [...members].sort((a, b) => a.priority - b.priority || a.id - b.id);
    const idx = sorted.findIndex((m) => m.id === memberId);
    const swapIdx = dir === "up" ? idx - 1 : idx + 1;
    if (idx < 0 || swapIdx < 0 || swapIdx >= sorted.length) return;
    const priA = sorted[idx].priority;
    const priB = sorted[swapIdx].priority;
    const idA = sorted[idx].id;
    const idB = sorted[swapIdx].id;
    // State local
    setMembers((cur) => cur.map((c) => {
      if (c.id === idA) return { ...c, priority: priB };
      if (c.id === idB) return { ...c, priority: priA };
      return c;
    }));
    // Cache global (para navegación inmediata)
    const cached = warmData<SubjectStudent[]>("/api/subject_students");
    if (cached) {
      put("/api/subject_students", cached.map((c) => {
        if (c.id === idA) return { ...c, priority: priB };
        if (c.id === idB) return { ...c, priority: priA };
        return c;
      }));
    }
  }

  async function moveMember(memberId: number, dir: "up" | "down") {
    applyMemberSwap(memberId, dir);
    setBusy(true);
    const res = await fetch("/api/subject_students", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: memberId, dir }),
    });
    setBusy(false);
    if (!res.ok) {
      toast("error", (await res.json().catch(() => ({}))).error || "No se pudo guardar");
    }
    // Refetch silencioso para sincronizar con servidor (sin invalidate previo)
    const ssAll = await fetchApi<SubjectStudent[]>("/api/subject_students");
    if (ssAll) {
      setMembers(ssAll.filter((x) => x.subjectId === id));
      put("/api/subject_students", ssAll);
    }
  }

  const memberSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncing = useRef(false);

  function handleMemberReorder(next: SubjectStudent[]) {
    const updated = next.map((n, i) => {
      const base = members.find((c) => c.id === n.id);
      return base ? { ...base, priority: i + 1 } : { ...n, priority: i + 1 };
    });
    setMembers(updated);
    // Persistir en cache para navegación inmediata
    const cached = warmData<SubjectStudent[]>("/api/subject_students");
    if (cached) {
      const prioMap = new Map(updated.map((u) => [u.id, u.priority]));
      put("/api/subject_students", cached.map((c) => {
        const newPri = prioMap.get(c.id);
        return newPri != null ? { ...c, priority: newPri } : c;
      }));
    }
    // Queue writes para que sobrevivan al desmontaje
    for (let i = 0; i < next.length; i++) {
      if (next[i].priority !== i + 1) {
        queuePriorityWrite("/api/subject_students", next[i].id, i + 1);
      }
    }
    if (memberSyncTimer.current) clearTimeout(memberSyncTimer.current);
    memberSyncTimer.current = setTimeout(async () => {
      syncing.current = true;
      try {
        await flushPendingPriorityWrites();
      } finally {
        syncing.current = false;
      }
      const ssAll = await fetchApi<SubjectStudent[]>("/api/subject_students");
      if (ssAll) {
        setMembers(ssAll.filter((x) => x.subjectId === id));
        put("/api/subject_students", ssAll);
      }
    }, 400);
  }

  // Flush pending writes al desmontar (navegación fuera)
  useEffect(() => {
    return () => {
      if (memberSyncTimer.current) {
        clearTimeout(memberSyncTimer.current);
        memberSyncTimer.current = null;
        // Fire-and-forget: flush queued writes en background
        void flushPendingPriorityWrites();
      }
    };
  }, []);

  async function confirmDelete() {
    if (!confirmTarget || deleting) return;
    setDeleting(true);
    const target = confirmTarget;
    if (target.kind === "member") {
      const res = await fetch(`/api/subject_students?id=${target.id}`, { method: "DELETE" });
      setDeleting(false);
      setConfirmTarget(null);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast("error", d.error || "Error al borrar");
        return;
      }
      setMembers((cur) => cur.filter((m) => m.id !== target.id));
      const cached = warmData<SubjectStudent[]>("/api/subject_students");
      if (cached) put("/api/subject_students", cached.filter((m) => m.id !== target.id));
      toast("success", "Alumno quitado");
      return;
    }

    const res = await fetch(`/api/subject_grade_durations?id=${target.id}`, { method: "DELETE" });
    setDeleting(false);
    setConfirmTarget(null);
    if (!res.ok) {
      toast("error", (await res.json().catch(() => ({}))).error || "No se pudo borrar");
      return;
    }
    const nextGrades = gradeDurations.filter((g) => g.id !== target.id);
    setGradeDurations(nextGrades);
    put(gradeKey, nextGrades);
    toast("success", "Regla de curso eliminada");
  }

  const memberIds = new Set(members.map((m) => m.studentId));
  const availableStudents = allStudents.filter((s) => !memberIds.has(s.id));
  const defaultDur = subject?.defaultDurationMin ?? 60;
  const durationOptions = useMemo(
    () => (subject ? collectSubjectDurationOptions(subject, members, gradeDurations) : []),
    [subject, members, gradeDurations],
  );

  const grades = useMemo(
    () => Array.from(new Set(allStudents.map((s) => (s.grade ?? "").trim()).filter(Boolean))).sort(),
    [allStudents],
  );

  const gradeRuleFor = (grade: string | null | undefined) =>
    gradeDurations.find((g) => g.grade === (grade ?? "").trim());

  function applyGradeRuleToForm(studentId: string) {
    const st = allStudents.find((s) => String(s.id) === studentId);
    const rule = st ? gradeRuleFor(st.grade) : undefined;
    if (rule) {
      setNewDurationMin(String(rule.durationMin));
      setNewSlotsRequired(String(rule.slotsRequired));
      const parts = Math.max(1, rule.sessionParts ?? 1);
      setNewSessionParts({
        split: parts > 1,
        sessionParts: String(parts > 1 ? parts : 2),
      });
    } else {
      setNewDurationMin("");
      setNewSlotsRequired("1");
      setNewSessionParts({ split: false, sessionParts: "2" });
    }
  }

  function openAddGrade() {
    setNewGrade("");
    setGradeDurationMin("60");
    setGradeSlotsRequired("1");
    setGradeSessionParts({ split: false, sessionParts: "2" });
    setGradeOpen(true);
  }

  async function submitGrade() {
    if (saving) return;
    if (!newGrade) return toast("error", "Selecciona un curso");
    const durationMin = Number(gradeDurationMin);
    if (!durationMin || durationMin < MIN_DURATION_MIN || durationMin % DURATION_STEP_MIN !== 0) {
      return toast("error", `Indica una duración múltiplo de ${DURATION_STEP_MIN} min (mín. ${MIN_DURATION_MIN})`);
    }
    const sessionParts = gradeSessionParts.split ? Number(gradeSessionParts.sessionParts) : 1;
    if (gradeSessionParts.split) {
      const maxParts = maxSessionParts(durationMin);
      if (sessionParts < 2 || sessionParts !== maxParts) {
        return toast("error", `Con ${fmtDurationMin(durationMin)} debes dividir en ${maxParts} partes de ${SESSION_PART_MIN} min`);
      }
    }
    setSaving(true);
    const res = await fetch("/api/subject_grade_durations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subjectId: id,
        grade: newGrade,
        durationMin,
        slotsRequired: Number(gradeSlotsRequired) || 1,
        sessionParts,
        enroll: true,
      }),
    });
    setSaving(false);
    if (!res.ok) return toast("error", (await res.json().catch(() => ({}))).error || "No se pudo guardar");
    const data = await res.json();
    toast("success", `Curso añadido: ${data.enrolled} alumno(s) inscrito(s)${data.skipped ? `, ${data.skipped} ya estaban` : ""}`);
    setGradeOpen(false);
    // Inscribe varios alumnos: refetch solo lo afectado, sin skeleton.
    invalidateMany(["/api/subject_students", gradeKey]);
    void loadSilent();
  }

  async function removeGradeRule(ruleId: number, grade: string) {
    setConfirmTarget({
      kind: "gradeRule",
      id: ruleId,
      label: `¿Eliminar la regla del curso ${grade}?`,
    });
  }

  const confirmMessage = confirmTarget ? confirmTarget.label : "";

  /** Fuerza la sincronización pendiente del drag antes de continuar. */
  async function flushPendingSync() {
    if (memberSyncTimer.current) {
      clearTimeout(memberSyncTimer.current);
      memberSyncTimer.current = null;
    }
    if (syncing.current) {
      await new Promise<void>((resolve) => {
        const check = () => { if (!syncing.current) resolve(); else setTimeout(check, 50); };
        check();
      });
    }
    await flushPendingPriorityWrites();
  }

  async function runAutoSchedule(apply = false) {
    setBusy(true);
    await flushPendingSync();
    const res = await fetch("/api/auto_schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subjectIds: [id],
        ...(!apply ? { simulate: true } : {}),
      }),
    });
    setBusy(false);
    if (!res.ok) return toast("error", (await res.json().catch(() => ({}))).error || "No se pudo auto-agendar");
    const data: AutoScheduleResult = await res.json();
    setAutoResult(data);
    if (!apply) {
      setAutoResultMode("preview");
      return;
    }
    setAutoResultMode("applied");
    toast("success", `Horario actualizado: ${data.assigned.length} colocados, ${data.unassigned.length} sin colocar`);
    invalidateMany(["/api/assignments", "/api/subject_students"]);
    void loadSilent();
  }

  async function autoScheduleSubject() {
    await runAutoSchedule(false);
  }

  async function applyPreviewedSchedule() {
    await runAutoSchedule(true);
  }

  async function toggleScheduleFixed(fixed: boolean) {
    const res = await fetch("/api/subjects", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, scheduleFixed: fixed }),
    });
    if (!res.ok) return toast("error", (await res.json().catch(() => ({}))).error || "No se pudo guardar");
    setSubject((s) => {
      if (!s) return s;
      const next = { ...s, scheduleFixed: fixed };
      const cached = warmData<Subject[]>("/api/subjects");
      if (cached) {
        put(
          "/api/subjects",
          cached.map((row) => (row.id === id ? { ...row, scheduleFixed: fixed } : row)),
        );
      }
      return next;
    });
    toast("success", fixed ? "Horario de esta asignatura fijado" : "Horario desbloqueado");
  }

  if (loading) {
    return (
      <div className="page-stack">
        <SubjectDetailSkeleton />
      </div>
    );
  }

  return (
    <div className="page-stack">
      <AutoScheduleResultDialog
        result={autoResult}
        onClose={() => setAutoResult(null)}
        mode={autoResultMode}
        onApply={autoResultMode === "preview" ? applyPreviewedSchedule : undefined}
        applying={busy}
      />
      <div className="space-y-3">
        <Button asChild variant="outline">
          <Link href="/subjects"><ArrowLeft size={16} /> Asignaturas</Link>
        </Button>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            {subject ? (
              <>
                <h1 className="section-title flex items-center gap-2 flex-wrap">
                  <BookOpen className="text-blue-600" /> {subject.name}
                  {subject.isCollective && <Badge variant="success">Colectiva</Badge>}
                </h1>
                <p className="text-gray-500 text-sm mt-1 flex flex-wrap items-center gap-2">
                  {durationOptions.length === 1 ? (
                    <>Sesión de {fmtDurationMin(durationOptions[0])}</>
                  ) : (
                    <>
                      <span>Sesiones de</span>
                      <SubjectDurationBadges
                        subject={subject}
                        members={members}
                        gradeDurations={gradeDurations}
                        className="font-normal gap-1"
                      />
                    </>
                  )}
                  {subject.isCollective && " · colectiva"}
                </p>
              </>
            ) : (
              <p className="text-gray-500 text-sm">Asignatura no encontrada</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            {!teacherScheduleFixed && subject && !subject.scheduleFixed && (
              <Button loading={busy} onClick={autoScheduleSubject}>
                <Sparkles size={16} />
                Auto-agendar
              </Button>
            )}
            {!teacherScheduleFixed && (
              <div className="inline-flex items-center gap-2 h-11 px-4 rounded-[0.6rem] border border-gray-200 bg-white">
                <Label htmlFor="subj-fixed" className="mb-0 cursor-pointer text-sm font-medium text-gray-800">
                  Fijar horario
                </Label>
                <Switch
                  id="subj-fixed"
                  checked={Boolean(subject?.scheduleFixed)}
                  onCheckedChange={toggleScheduleFixed}
                  disabled={busy || !subject}
                />
              </div>
            )}
            <Button asChild variant="outline">
              <Link href="/requests"><ClipboardList size={16} /> Preferencia horaria</Link>
            </Button>
          </div>
        </div>
      </div>

      {!subject ? null : (<>
      <Card className="p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold flex items-center gap-2"><GraduationCap size={18} className="text-blue-600" /> Alumnos inscritos</h2>
          {!teacherScheduleFixed && (
            <div className="flex flex-wrap gap-2">
              {!subject.isCollective && grades.length > 0 && (
                <Button variant="outline" onClick={openAddGrade}><Plus size={16} /> Añadir curso</Button>
              )}
              <Button onClick={openAddMember}><Plus size={16} /> Añadir alumno</Button>
            </div>
          )}
        </div>

        {!subject.isCollective && gradeDurations.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {gradeDurations.map((g) => (
              <Badge key={g.id} variant="gray" className="gap-1.5 pr-1">
                {g.grade}: {fmtDurationMin(g.durationMin)} · {g.slotsRequired} solic.
                {(g.sessionParts ?? 1) > 1 ? ` · ${g.sessionParts}×${SESSION_PART_MIN} min` : ""}
                {!teacherScheduleFixed && (
                  <button
                    type="button"
                    onClick={() => removeGradeRule(g.id, g.grade)}
                    className="ml-0.5 rounded hover:bg-gray-200 p-0.5"
                    aria-label={`Quitar regla de ${g.grade}`}
                  >
                    <X size={12} />
                  </button>
                )}
              </Badge>
            ))}
          </div>
        )}
        
        {sortedMembers.length === 0 ? (
          <div className="text-gray-500 text-sm">Sin alumnos inscritos</div>
        ) : teacherScheduleFixed ? (
          <div className="space-y-2">
            {sortedMembers.map((m) => {
              const reqs = requestsByStudent[m.studentId] ?? [];
              return (
                <MemberRow key={m.id} m={m} readOnly className="flex items-center">
                  <span className="font-medium">{m.student.name}</span>
                  {m.student.grade && <span className="text-gray-400 text-xs">{m.student.grade}</span>}
                  {!subject.isCollective && (
                    <>
                      <span className="text-gray-500 text-xs">Duración: {m.durationMin == null ? <span className="italic">{fmtDurationMin(defaultDur)} (defecto)</span> : fmtDurationMin(m.durationMin)}</span>
                      {(m.sessionParts ?? 1) > 1 && (
                        <Badge variant="gray">{m.sessionParts}×{SESSION_PART_MIN} min</Badge>
                      )}
                    </>
                  )}
                  {!subject.isCollective && (
                    <Badge
                      variant={reqs.length >= m.slotsRequired ? "success" : "warn"}
                    >
                      {COPY.slotsProgress(reqs.length, m.slotsRequired)}
                    </Badge>
                  )}
                  {subject.isCollective && reqs.length > 0 && (
                    <Badge variant="gray">{reqs.length} preferencia{reqs.length === 1 ? "" : "s"}</Badge>
                  )}
                </MemberRow>
              );
            })}
          </div>
        ) : (
          <Reorder.Group axis="y" values={sortedMembers} onReorder={handleMemberReorder} layoutScroll className="space-y-2 reorder-group">
            <AnimatePresence initial={false}>
              {sortedMembers.map((m, mi) => {
                const reqs = requestsByStudent[m.studentId] ?? [];
                return (
                  <MemberRow key={m.id} m={m} className="flex items-center">
                    <div className="inline-flex items-center gap-1">
                      <Button size="iconSm" variant="ghost" onClick={() => moveMember(m.id, "up")} disabled={busy || syncing.current || mi === 0} aria-label="Subir prioridad"><ArrowUp size={14} /></Button>
                      <Button size="iconSm" variant="ghost" onClick={() => moveMember(m.id, "down")} disabled={busy || syncing.current || mi === sortedMembers.length - 1} aria-label="Bajar prioridad"><ArrowDown size={14} /></Button>
                    </div>
                    <span className="font-medium">{m.student.name}</span>
                    {m.student.grade && <span className="text-gray-400 text-xs">{m.student.grade}</span>}
                    {!subject.isCollective && (
                      <>
                        <span className="text-gray-500 text-xs">Duración: {m.durationMin == null ? <span className="italic">{fmtDurationMin(defaultDur)} (defecto)</span> : fmtDurationMin(m.durationMin)}</span>
                        {(m.sessionParts ?? 1) > 1 && (
                          <Badge variant="gray">{m.sessionParts}×{SESSION_PART_MIN} min</Badge>
                        )}
                      </>
                    )}
                    {!subject.isCollective && (
                      <Badge
                        variant={reqs.length >= m.slotsRequired ? "success" : "warn"}
                      >
                        {COPY.slotsProgress(reqs.length, m.slotsRequired)}
                      </Badge>
                    )}
                    {subject.isCollective && reqs.length > 0 && (
                      <Badge variant="gray">{reqs.length} preferencia{reqs.length === 1 ? "" : "s"}</Badge>
                    )}
                    <div className="flex gap-1.5 ml-auto">
                      <Button size="iconSm" variant="outline" onClick={() => openEditMember(m)} aria-label="Editar"><Pencil size={14} /></Button>
                      <Button size="iconSm" variant="destructive" onClick={() => setConfirmTarget({ kind: "member", id: m.id, label: `¿Quitar a ${m.student.name} de la asignatura?` })} aria-label="Quitar"><Trash2 size={14} /></Button>
                    </div>
                  </MemberRow>
                );
              })}
            </AnimatePresence>
          </Reorder.Group>
        )}
      </Card>
      </>)}

      <AddMemberDialog
        open={memberOpen}
        onOpenChange={setMemberOpen}
        availableStudents={availableStudents}
        isCollective={Boolean(subject?.isCollective)}
        defaultDur={defaultDur}
        studentId={newStudent}
        onStudentChange={(v) => { setNewStudent(v); applyGradeRuleToForm(v); }}
        slotsRequired={newSlotsRequired}
        onSlotsRequiredChange={setNewSlotsRequired}
        durationMin={newDurationMin}
        onDurationMinChange={setNewDurationMin}
        sessionParts={newSessionParts}
        onSessionPartsChange={setNewSessionParts}
        gradeRuleHint={Boolean(newStudent && gradeRuleFor(allStudents.find((s) => String(s.id) === newStudent)?.grade))}
        saving={saving}
        onSubmit={submitMember}
      />

      <AddGradeDialog
        open={gradeOpen}
        onOpenChange={setGradeOpen}
        grades={grades}
        grade={newGrade}
        onGradeChange={setNewGrade}
        durationMin={gradeDurationMin}
        onDurationMinChange={setGradeDurationMin}
        slotsRequired={gradeSlotsRequired}
        onSlotsRequiredChange={setGradeSlotsRequired}
        sessionParts={gradeSessionParts}
        onSessionPartsChange={setGradeSessionParts}
        saving={saving}
        onSubmit={submitGrade}
      />

      <EditMemberDialog
        open={editMember != null}
        onOpenChange={(o) => { if (!o) setEditMember(null); }}
        isCollective={Boolean(subject?.isCollective)}
        defaultDur={defaultDur}
        slotsRequired={editSlots}
        onSlotsRequiredChange={setEditSlots}
        durationMin={editDuration}
        onDurationMinChange={setEditDuration}
        sessionParts={editSessionParts}
        onSessionPartsChange={setEditSessionParts}
        saving={saving}
        onSubmit={submitEditMember}
      />

      <AlertDialog open={confirmTarget !== null} onOpenChange={(o) => { if (!o && !deleting) setConfirmTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmTarget?.kind === "gradeRule" ? "Eliminar regla de curso" : "Confirmar"}
            </AlertDialogTitle>
            <AlertDialogDescription>{confirmMessage}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              loading={deleting}
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
            >
              Borrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
