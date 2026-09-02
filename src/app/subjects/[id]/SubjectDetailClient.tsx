"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Plus, Trash2, Save, X, BookOpen, GraduationCap, ClipboardList,
  Pencil, ArrowUp, ArrowDown, Sparkles,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { AnimatePresence, Reorder, useDragControls } from "motion/react";
import { DragHandle } from "@/components/DragHandle";
import { useToast } from "@/components/Toast";
import { Switch } from "@/components/ui/switch";
import AutoScheduleResultDialog, { type AutoScheduleResult } from "@/components/AutoScheduleResultDialog";
import { fmtDurationMin, collectSubjectDurationOptions } from "@/lib/hours";
import SubjectDurationBadges from "@/components/SubjectDurationBadges";
import { invalidate, invalidateMany, put, warmData } from "@/lib/clientCache";
import { SubjectDetailSkeleton } from "@/components/skeletons";
import { COPY } from "@/lib/copy";

interface Student { id: number; name: string; grade?: string | null; }
interface Subject { id: number; name: string; teacherId: number; defaultDurationMin: number; isCollective?: boolean; scheduleFixed?: boolean; teacher?: { name: string; scheduleFixed?: boolean }; }
interface SubjectStudent {
  id: number; subjectId: number; studentId: number;
  durationMin: number | null; priority: number; slotsRequired: number;
  student: Student;
}
interface SlotRequest {
  id: number; studentId: number; subjectId: number;
  dayOfWeek: number; startHour: number; endHour: number;
  prefOrder: number; status: string;
}
interface GradeDuration {
  id: number; subjectId: number; grade: string;
  durationMin: number; slotsRequired: number;
}
type ConfirmTarget =
  | { kind: "member"; id: number; label: string }
  | { kind: "gradeRule"; id: number; label: string }
  | null;

function MemberRow({ m, children, className }: {
  m: SubjectStudent;
  children: React.ReactNode; className?: string;
}) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={m}
      layout
      dragListener={false}
      dragControls={controls}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      whileDrag={{ scale: 1.01, boxShadow: "0 12px 32px rgb(0 0 0 / 0.14)", zIndex: 20 }}
      className={className}
    >
      <div className="flex items-center gap-2 flex-wrap border border-gray-100 rounded-lg px-3 py-2 w-full">
        <DragHandle controls={controls} />
        {children}
      </div>
    </Reorder.Item>
  );
}


export default function SubjectDetailClient({ id }: { id: number }) {
  const toast = useToast();
  const [subject, setSubject] = useState<Subject | null>(null);
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<SubjectStudent[]>([]);
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [slotRequests, setSlotRequests] = useState<SlotRequest[]>([]);
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget>(null);
  const [busy, setBusy] = useState(false);
  const [autoResult, setAutoResult] = useState<AutoScheduleResult | null>(null);

  // member modal
  const [memberOpen, setMemberOpen] = useState(false);
  const [newStudent, setNewStudent] = useState("");
  const [newSlotsRequired, setNewSlotsRequired] = useState("1");
  const [newDurationMin, setNewDurationMin] = useState("");
  const nextPriorityRef = useRef<number | null>(null);

  // grade modal
  const [gradeOpen, setGradeOpen] = useState(false);
  const [newGrade, setNewGrade] = useState("");
  const [gradeDurationMin, setGradeDurationMin] = useState("30");
  const [gradeSlotsRequired, setGradeSlotsRequired] = useState("1");
  const [gradeDurations, setGradeDurations] = useState<GradeDuration[]>([]);
  const [teacherScheduleFixed, setTeacherScheduleFixed] = useState(false);

  // edit member modal
  const [editMember, setEditMember] = useState<SubjectStudent | null>(null);
  const [editDuration, setEditDuration] = useState("");
  const [editSlots, setEditSlots] = useState("1");

  const gradeKey = `/api/subject_grade_durations?subjectId=${id}`;

  function hydrateFromCache(): boolean {
    const allSubjects = warmData<Subject[]>("/api/subjects");
    const ssAll = warmData<SubjectStudent[]>("/api/subject_students");
    const st = warmData<Student[]>("/api/students");
    const srAll = warmData<SlotRequest[]>("/api/slot_requests");
    if (!allSubjects || !ssAll || !st || !srAll) return false;
    const s = allSubjects.find((x) => x.id === id) ?? null;
    if (!s) return false;
    setSubject(s);
    setMembers(ssAll.filter((x) => x.subjectId === id));
    setAllStudents(st);
    setSlotRequests(srAll.filter((x) => x.subjectId === id));
    setGradeDurations(warmData<GradeDuration[]>(gradeKey) ?? []);
    const teachers = warmData<{ scheduleFixed?: boolean }[]>("/api/teachers");
    if (teachers) setTeacherScheduleFixed(Boolean(teachers[0]?.scheduleFixed));
    return true;
  }

  async function load() {
    if (hydrateFromCache()) {
      setLoading(false);
      if (warmData<GradeDuration[]>(gradeKey) === null) {
        try {
          const gd = await fetch(gradeKey).then((r) => r.json()) as GradeDuration[];
          setGradeDurations(gd);
          put(gradeKey, gd);
        } catch { /* ignore */ }
      }
      return;
    }
    try {
      const [allSubjects, ssAll, st, srAll, gd, teachers] = await Promise.all([
        fetch("/api/subjects").then((r) => r.json()) as Promise<Subject[]>,
        fetch("/api/subject_students").then((r) => r.json()) as Promise<SubjectStudent[]>,
        fetch("/api/students").then((r) => r.json()) as Promise<Student[]>,
        fetch("/api/slot_requests").then((r) => r.json()) as Promise<SlotRequest[]>,
        fetch(gradeKey).then((r) => r.json()) as Promise<GradeDuration[]>,
        fetch("/api/teachers").then((r) => r.json()) as Promise<{ scheduleFixed?: boolean }[]>,
      ]);
      const s = allSubjects.find((x) => x.id === id) ?? null;
      const ss = ssAll.filter((x) => x.subjectId === id);
      const sr = srAll.filter((x) => x.subjectId === id);
      setSubject(s);
      setMembers(ss);
      setAllStudents(st);
      setSlotRequests(sr);
      setGradeDurations(gd);
      setTeacherScheduleFixed(Boolean(teachers[0]?.scheduleFixed));
      put("/api/subjects", allSubjects);
      put("/api/subject_students", ssAll);
      put("/api/students", st);
      put("/api/slot_requests", srAll);
      put(gradeKey, gd);
      put("/api/teachers", teachers);
    } finally {
      setLoading(false);
    }
  }

  useLayoutEffect(() => {
    if (hydrateFromCache()) setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [id]);

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
    setMemberOpen(true);
  }

  async function submitMember() {
    if (!newStudent) return toast("error", "Selecciona un alumno");
    const payload: Record<string, unknown> = {
      subjectId: id,
      studentId: Number(newStudent),
      slotsRequired: Number(newSlotsRequired),
    };
    if (nextPriorityRef.current != null) payload.priority = nextPriorityRef.current;
    if (newDurationMin.trim() !== "") payload.durationMin = Number(newDurationMin);
    const res = await fetch("/api/subject_students", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return toast("error", (await res.json().catch(() => ({}))).error || "No se pudo guardar");
    toast("success", "Alumno añadido");
    setMemberOpen(false);
    invalidateMany(["/api/subject_students", "/api/students"]);
    await load();
  }

  function openEditMember(m: SubjectStudent) {
    setEditMember(m);
    setEditDuration(m.durationMin == null ? "" : String(m.durationMin));
    setEditSlots(String(m.slotsRequired));
  }

  async function submitEditMember() {
    if (!editMember) return;
    const durationMin = editDuration.trim() === "" ? null : Number(editDuration);
    const slotsRequired = Number(editSlots);
    if (
      slotsRequired === editMember.slotsRequired &&
      durationMin === editMember.durationMin
    ) {
      setEditMember(null);
      return;
    }
    const patch: Record<string, unknown> = { slotsRequired, durationMin };
    const res = await fetch("/api/subject_students", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editMember.id, ...patch }),
    });
    if (!res.ok) return toast("error", (await res.json().catch(() => ({}))).error || "No se pudo guardar");
    toast("success", "Alumno actualizado");
    setEditMember(null);
    invalidate("/api/subject_students");
    await load();
  }

  async function moveMember(memberId: number, dir: "up" | "down") {
    setBusy(true);
    const res = await fetch("/api/subject_students", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: memberId, dir }),
    });
    setBusy(false);
    if (!res.ok) return toast("error", (await res.json().catch(() => ({}))).error || "No se pudo guardar");
    invalidate("/api/subject_students");
    await load();
  }

  const memberSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleMemberReorder(next: SubjectStudent[]) {
    // renumeracion unica optimista
    setMembers((cur) =>
      next.map((n) => {
        const base = cur.find((c) => c.id === n.id);
        return base ? { ...base, priority: next.findIndex((x) => x.id === n.id) + 1 } : n;
      })
    );
    if (memberSyncTimer.current) clearTimeout(memberSyncTimer.current);
    memberSyncTimer.current = setTimeout(async () => {
      for (let i = 0; i < next.length; i++) {
        if (next[i].priority !== i + 1) {
          await fetch("/api/subject_students", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: next[i].id, to: i + 1 }),
          });
        }
      }
      invalidate("/api/subject_students");
      await load();
    }, 400);
  }

  async function confirmDelete() {
    if (!confirmTarget) return;
    if (confirmTarget.kind === "member") {
      const res = await fetch(`/api/subject_students?id=${confirmTarget.id}`, { method: "DELETE" });
      setConfirmTarget(null);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast("error", d.error || "Error al borrar");
      } else {
        toast("success", "Alumno quitado");
      }
    } else {
      const res = await fetch(`/api/subject_grade_durations?id=${confirmTarget.id}`, { method: "DELETE" });
      setConfirmTarget(null);
      if (!res.ok) {
        toast("error", (await res.json().catch(() => ({}))).error || "No se pudo borrar");
      } else {
        toast("success", "Regla de curso eliminada");
      }
    }
    invalidateMany(["/api/subject_students", "/api/subjects", gradeKey]);
    await load();
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
    } else {
      setNewDurationMin("");
      setNewSlotsRequired("1");
    }
  }

  function openAddGrade() {
    setNewGrade("");
    setGradeDurationMin("30");
    setGradeSlotsRequired("1");
    setGradeOpen(true);
  }

  async function submitGrade() {
    if (!newGrade) return toast("error", "Selecciona un curso");
    const durationMin = Number(gradeDurationMin);
    if (!durationMin || durationMin < 5) return toast("error", "Indica una duración válida");
    const res = await fetch("/api/subject_grade_durations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subjectId: id,
        grade: newGrade,
        durationMin,
        slotsRequired: Number(gradeSlotsRequired) || 1,
        enroll: true,
      }),
    });
    if (!res.ok) return toast("error", (await res.json().catch(() => ({}))).error || "No se pudo guardar");
    const data = await res.json();
    toast("success", `Curso añadido: ${data.enrolled} alumno(s) inscrito(s)${data.skipped ? `, ${data.skipped} ya estaban` : ""}`);
    setGradeOpen(false);
    invalidateMany(["/api/subject_students", gradeKey]);
    await load();
  }

  async function removeGradeRule(ruleId: number, grade: string) {
    setConfirmTarget({
      kind: "gradeRule",
      id: ruleId,
      label: `¿Eliminar la regla del curso ${grade}?`,
    });
  }

  const confirmMessage = confirmTarget ? confirmTarget.label : "";

  async function autoScheduleSubject() {
    setBusy(true);
    setAutoResult(null);
    const res = await fetch("/api/auto_schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subjectIds: [id] }),
    });
    setBusy(false);
    if (!res.ok) return toast("error", (await res.json().catch(() => ({}))).error || "No se pudo auto-agendar");
    const data: AutoScheduleResult = await res.json();
    setAutoResult(data);
    toast("success", `${data.assigned.length} colocados, ${data.unassigned.length} sin colocar`);
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
      <AutoScheduleResultDialog result={autoResult} onClose={() => setAutoResult(null)} />
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
              <Button disabled={busy} onClick={autoScheduleSubject}>
                <Sparkles size={16} /> Auto-agendar
              </Button>
            )}
            <div className="inline-flex items-center gap-2 h-11 px-4 rounded-[0.6rem] border border-gray-200 bg-white">
              <Label htmlFor="subj-fixed" className="mb-0 cursor-pointer text-sm font-medium text-gray-800">
                Fijar horario
              </Label>
              <Switch
                id="subj-fixed"
                checked={teacherScheduleFixed || Boolean(subject?.scheduleFixed)}
                onCheckedChange={toggleScheduleFixed}
                disabled={busy || !subject || teacherScheduleFixed}
                title={teacherScheduleFixed ? "El horario está fijado en tu perfil" : undefined}
              />
            </div>
            <Button asChild variant="outline">
              <Link href="/requests"><ClipboardList size={16} /> Solicitudes</Link>
            </Button>
          </div>
        </div>
      </div>

      {!subject ? null : (<>
      <Card className="p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold flex items-center gap-2"><GraduationCap size={18} className="text-blue-600" /> Alumnos inscritos</h2>
          <div className="flex flex-wrap gap-2">
            {!subject.isCollective && grades.length > 0 && (
              <Button variant="outline" onClick={openAddGrade}><Plus size={16} /> Añadir curso</Button>
            )}
            <Button onClick={openAddMember}><Plus size={16} /> Añadir alumno</Button>
          </div>
        </div>

        {!subject.isCollective && gradeDurations.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {gradeDurations.map((g) => (
              <Badge key={g.id} variant="gray" className="gap-1.5 pr-1">
                {g.grade}: {fmtDurationMin(g.durationMin)} · {g.slotsRequired} solic.
                <button
                  type="button"
                  onClick={() => removeGradeRule(g.id, g.grade)}
                  className="ml-0.5 rounded hover:bg-gray-200 p-0.5"
                  aria-label={`Quitar regla de ${g.grade}`}
                >
                  <X size={12} />
                </button>
              </Badge>
            ))}
          </div>
        )}
        
        {sortedMembers.length === 0 ? (
          <div className="text-gray-500 text-sm">Sin alumnos inscritos</div>
        ) : (
          <Reorder.Group axis="y" values={sortedMembers} onReorder={handleMemberReorder} layoutScroll className="space-y-2 reorder-group">
            <AnimatePresence initial={false}>
              {sortedMembers.map((m, mi) => {
                const reqs = requestsByStudent[m.studentId] ?? [];
                return (
                  <MemberRow key={m.id} m={m} className="flex items-center">
                    <div className="inline-flex items-center gap-1">
                      <Button size="iconSm" variant="ghost" onClick={() => moveMember(m.id, "up")} disabled={busy || mi === 0} aria-label="Subir prioridad"><ArrowUp size={14} /></Button>
                      <Button size="iconSm" variant="ghost" onClick={() => moveMember(m.id, "down")} disabled={busy || mi === sortedMembers.length - 1} aria-label="Bajar prioridad"><ArrowDown size={14} /></Button>
                    </div>
                    <span className="font-medium">{m.student.name}</span>
                    {m.student.grade && <span className="text-gray-400 text-xs">{m.student.grade}</span>}
                    {!subject.isCollective && (
                      <span className="text-gray-500 text-xs">Duración: {m.durationMin == null ? <span className="italic">{fmtDurationMin(defaultDur)} (defecto)</span> : fmtDurationMin(m.durationMin)}</span>
                    )}
                    {!subject.isCollective && (
                      <Badge
                        variant={reqs.length >= m.slotsRequired ? "success" : "warn"}
                      >
                        {COPY.slotsProgress(reqs.length, m.slotsRequired)}
                      </Badge>
                    )}
                    {subject.isCollective && reqs.length > 0 && (
                      <Badge variant="gray">{reqs.length} solicitud{reqs.length === 1 ? "" : "es"}</Badge>
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

      {/* Modals */}
      <Dialog open={memberOpen} onOpenChange={setMemberOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Añadir alumno a la asignatura</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="m-student">Alumno</Label>
              <Select value={newStudent} onValueChange={(v) => { setNewStudent(v); applyGradeRuleToForm(v); }}>
                <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                <SelectContent>
                  {availableStudents.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.name}{s.grade ? ` · ${s.grade}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {availableStudents.length === 0 && (
                <div className="mt-2 flex flex-col sm:flex-row sm:items-center gap-2">
                  <p className="text-xs text-gray-500">Todos los alumnos ya están inscritos.</p>
                  <Button asChild size="xs" variant="outline">
                    <Link href="/students"><Plus /> Crear alumno</Link>
                  </Button>
                </div>
              )}
            </div>
            <div className="space-y-4">
              {!subject?.isCollective && (
                <>
                  <div>
                    <Label htmlFor="m-slots">{COPY.slotsRequiredLabel}</Label>
                    <Input id="m-slots" type="number" min={1} max={10} value={newSlotsRequired} onChange={(e) => setNewSlotsRequired(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="m-dur">{COPY.durationLabel}</Label>
                    <Input id="m-dur" type="number" min={5} step={5} value={newDurationMin} onChange={(e) => setNewDurationMin(e.target.value)} placeholder={String(defaultDur)} />
                    {newStudent && gradeRuleFor(allStudents.find((s) => String(s.id) === newStudent)?.grade) && (
                      <p className="text-xs text-gray-500 mt-1">Pre-rellenado por regla del curso</p>
                    )}
                  </div>
                </>
              )}
            </div>
            {subject?.isCollective ? (
              <p className="text-xs text-gray-700 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                La duración de la sesión colectiva es <strong>{fmtDurationMin(defaultDur)}</strong> (definida en la asignatura).
              </p>
            ) : (
              <p className="text-xs text-gray-700 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                Prioridad: entrará el <strong>último</strong> de la fila (después de los actuales). Reordénalo luego con ▲▼.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMemberOpen(false)}><X size={14} /> Cancelar</Button>
            <Button onClick={submitMember}><Save size={14} /> Añadir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={gradeOpen} onOpenChange={setGradeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Añadir curso a la asignatura</DialogTitle>
            <DialogDescription>Inscribe el curso con una duración.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="g-grade">Curso</Label>
              <Select value={newGrade} onValueChange={setNewGrade}>
                <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                <SelectContent>
                  {grades.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="g-dur">Duración de clase para este curso (minutos)</Label>
                <Input id="g-dur" type="number" min={5} step={5} value={gradeDurationMin} onChange={(e) => setGradeDurationMin(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="g-slots">{COPY.slotsRequiredLabel}</Label>
                <Input id="g-slots" type="number" min={1} max={10} value={gradeSlotsRequired} onChange={(e) => setGradeSlotsRequired(e.target.value)} />
              </div>
            </div>
            {newGrade && (
              <p className="text-xs text-gray-700 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                Se inscribirán los alumnos de <strong>{newGrade}</strong> que aún no estén en esta asignatura, cada uno con clase de <strong>{fmtDurationMin(Number(gradeDurationMin) || 0)}</strong>.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGradeOpen(false)}><X size={14} /> Cancelar</Button>
            <Button onClick={submitGrade}><Save size={14} /> Añadir curso</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editMember != null} onOpenChange={(o) => { if (!o) setEditMember(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="text-center sm:text-center">
            <DialogTitle>Editar inscripción</DialogTitle>
          </DialogHeader>
          <div className="mx-auto w-full max-w-xs space-y-4 py-1">
            {!subject?.isCollective && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="em-slots">{COPY.slotsRequiredLabel}</Label>
                  <Input id="em-slots" type="number" min={1} max={10} value={editSlots} onChange={(e) => setEditSlots(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="em-dur">{COPY.durationLabel}</Label>
                  <Input id="em-dur" type="number" min={5} step={5} value={editDuration} onChange={(e) => setEditDuration(e.target.value)} placeholder={String(defaultDur)} />
                </div>
              </>
            )}
            {subject?.isCollective && (
              <p className="text-xs text-gray-500 text-center">En asignaturas colectivas la duración es común: {fmtDurationMin(defaultDur)}.</p>
            )}
          </div>
          <DialogFooter className="sm:justify-center gap-2">
            <Button variant="outline" onClick={() => setEditMember(null)}><X size={14} /> Cancelar</Button>
            <Button onClick={submitEditMember}><Save size={14} /> Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmTarget !== null} onOpenChange={(o) => { if (!o) setConfirmTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmTarget?.kind === "gradeRule" ? "Eliminar regla de curso" : "Confirmar"}
            </AlertDialogTitle>
            <AlertDialogDescription>{confirmMessage}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Borrar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}