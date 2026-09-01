"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Plus, Trash2, Save, X, BookOpen, GraduationCap, ClipboardList,
  Briefcase, Pencil, ArrowUp, ArrowDown, Sparkles,
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
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { HeaderActionsSkeleton, TableCardSkeleton } from "@/components/skeletons";
import AutoScheduleResultDialog, { type AutoScheduleResult } from "@/components/AutoScheduleResultDialog";
import { DAYS } from "@/lib/validate";
import { fmtRange, hourOptions, fmtDurationMin } from "@/lib/hours";
import { invalidate, invalidateMany } from "@/lib/clientCache";
import { getSlotHourSets, normalizeRanges, snapSlotHours, validateSlotRequest, type TimeRange } from "@/lib/studentAvailability";

interface Student { id: number; name: string; availableRanges?: TimeRange[]; blockedRanges?: TimeRange[]; }
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
interface Availability { id: number; dayOfWeek: number; startHour: number; endHour: number; }
type ConfirmTarget =
  | { kind: "member"; id: number; label: string }
  | { kind: "slot"; id: number; label: string }
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


function SlotRowItem({ r, children }: { r: SlotRequest; children: React.ReactNode }) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={r}
      layout
      dragListener={false}
      dragControls={controls}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -8 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      whileDrag={{ scale: 1.02, boxShadow: "0 8px 24px rgb(0 0 0 / 0.12)", zIndex: 20 }}
      className="flex flex-wrap sm:flex-nowrap items-center gap-x-2 gap-y-1.5 text-sm bg-gray-50 rounded-lg px-2 py-2"
    >
      <DragHandle controls={controls} size={14} />
      {children}
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
  const [availabilities, setAvailabilities] = useState<Availability[]>([]);
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget>(null);
  const [busy, setBusy] = useState(false);
  const [autoResult, setAutoResult] = useState<AutoScheduleResult | null>(null);

  // member modal
  const [memberOpen, setMemberOpen] = useState(false);
  const [newStudent, setNewStudent] = useState("");
  const [newSlotsRequired, setNewSlotsRequired] = useState("1");
  const [newDurationMin, setNewDurationMin] = useState("");
  const nextPriorityRef = useRef<number | null>(null);

  // edit member modal
  const [editMember, setEditMember] = useState<SubjectStudent | null>(null);
  const [editDuration, setEditDuration] = useState("");
  const [editPriority, setEditPriority] = useState("1");
  const [editSlots, setEditSlots] = useState("1");

  // slot request modal
  const [srOpen, setSrOpen] = useState(false);
  const [srStudent, setSrStudent] = useState("");
  const [srDay, setSrDay] = useState("0");
  const [srStart, setSrStart] = useState("");
  const [srEnd, setSrEnd] = useState("");
  const HOURS_START = hourOptions(8, 23);
  const HOURS_END = hourOptions(9, 24);

  function hourItem(o: { value: string; label: string }, allowed: Set<string>) {
    if (!allowed.has(o.value)) return null;
    return (
      <SelectItem key={o.value} value={o.value}>
        {o.label}
      </SelectItem>
    );
  }

  const srHourSets = useMemo(
    () =>
      getSlotHourSets(
        Number(srDay),
        availabilities,
        normalizeRanges(allStudents.find((s) => String(s.id) === srStudent)?.availableRanges),
        normalizeRanges(allStudents.find((s) => String(s.id) === srStudent)?.blockedRanges),
        HOURS_START,
        HOURS_END,
        srStart
      ),
    [availabilities, srDay, srStudent, srStart, allStudents]
  );

  useEffect(() => {
    if (!srOpen || !srStudent) return;
    const st = allStudents.find((s) => String(s.id) === srStudent);
    const snapped = snapSlotHours(
      Number(srDay),
      availabilities,
      normalizeRanges(st?.availableRanges),
      normalizeRanges(st?.blockedRanges),
      HOURS_START,
      HOURS_END,
      srStart,
      srEnd
    );
    if (snapped.start !== srStart) setSrStart(snapped.start);
    if (snapped.end !== srEnd) setSrEnd(snapped.end);
  }, [srOpen, srStudent, srDay, availabilities, allStudents]);

  async function load() {
    try {
      const [s, ss, st, sr] = await Promise.all([
        fetch("/api/subjects").then((r) => r.json()).then((arr: Subject[]) => arr.find((x) => x.id === id) ?? null),
        fetch(`/api/subject_students?subjectId=${id}`).then((r) => r.json()) as Promise<SubjectStudent[]>,
        fetch("/api/students").then((r) => r.json()),
        fetch(`/api/slot_requests?subjectId=${id}`).then((r) => r.json()) as Promise<SlotRequest[]>,
      ]);
      const av = s ? (await fetch("/api/availabilities").then((r) => r.json())) as Availability[] : [];
      setSubject(s);
      setMembers(ss);
      setAllStudents(st);
      setSlotRequests(sr);
      setAvailabilities(av);
    } finally {
      setLoading(false);
    }
  }

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

  const nameOf = (sid: number) => allStudents.find((x) => x.id === sid)?.name ?? `#${sid}`;

  const sortedMembers = useMemo(
    () => [...members].sort((a, b) => a.priority - b.priority || a.id - b.id),
    [members]
  );

  function srIssue(): string {
    if (srStart === "" || srEnd === "") return "";
    const st = allStudents.find((s) => String(s.id) === srStudent);
    return validateSlotRequest({
      day: Number(srDay),
      start: Number(srStart),
      end: Number(srEnd),
      teacherAvails: availabilities,
      studentAvailable: normalizeRanges(st?.availableRanges),
      studentBlocked: normalizeRanges(st?.blockedRanges),
    }) ?? "";
  }
  const srError = srIssue();

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
    setEditPriority(String(m.priority));
    setEditSlots(String(m.slotsRequired));
  }

  async function submitEditMember() {
    if (!editMember) return;
    const patch: Record<string, unknown> = {
      priority: Number(editPriority),
      slotsRequired: Number(editSlots),
    };
    patch.durationMin = editDuration.trim() === "" ? null : Number(editDuration);
    const res = await fetch("/api/subject_students", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editMember.id, ...patch }),
    });
    if (!res.ok) return toast("error", (await res.json().catch(() => ({}))).error || "No se pudo guardar");
    toast("success", "Alumno actualizado");
    setEditMember(null);
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
    await load();
  }

  async function moveSlotTo(slotId: number, to: number) {
    setBusy(true);
    const res = await fetch("/api/slot_requests", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: slotId, to }),
    });
    setBusy(false);
    if (!res.ok) return toast("error", (await res.json().catch(() => ({}))).error || "No se pudo guardar");
    await load();
  }

  const pendingSync = useRef<{ id: number; to: number }[]>([]);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleReorder(next: SlotRequest[], studentId: number) {
    const prev = (requestsByStudent[studentId] ?? []).slice().sort((a, b) => a.prefOrder - b.prefOrder || a.id - b.id);
    const moved = prev.find((x, i) => next[i]?.id !== x.id);
    setSlotRequests((cur) =>
      cur.map((r) => {
        if (r.studentId !== studentId) return r;
        const ni = next.findIndex((x) => x.id === r.id);
        return ni >= 0 ? { ...r, prefOrder: ni + 1 } : r;
      })
    );
    if (!moved) return;
    const to = next.findIndex((x) => x.id === moved.id) + 1;
    if (to < 1) return;
    pendingSync.current = pendingSync.current.filter((p) => p.id !== moved.id);
    pendingSync.current.push({ id: moved.id, to });
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => {
      const items = [...pendingSync.current];
      pendingSync.current = [];
      void (async () => {
        for (const p of items) {
          await fetch("/api/slot_requests", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: p.id, to: p.to }),
          });
        }
        await load();
      })();
    }, 400);
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
      await load();
    }, 400);
  }

  async function moveSlot(slotId: number, dir: "up" | "down") {
    setBusy(true);
    const res = await fetch("/api/slot_requests", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: slotId, dir }),
    });
    setBusy(false);
    if (!res.ok) return toast("error", (await res.json().catch(() => ({}))).error || "No se pudo guardar");
    await load();
  }

  async function confirmDelete() {
    if (!confirmTarget) return;
    let res: Response;
    let label = "";
    if (confirmTarget.kind === "member") {
      res = await fetch(`/api/subject_students?id=${confirmTarget.id}`, { method: "DELETE" });
      label = "Alumno quitado";
    } else {
      res = await fetch(`/api/slot_requests?id=${confirmTarget.id}`, { method: "DELETE" });
      label = "Posibilidad borrada";
    }
    setConfirmTarget(null);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast("error", d.error || "Error al borrar");
    } else {
      toast("success", label);
    }
    await load();
  }

  async function submitSr() {
    if (!srStudent) return toast("error", "Selecciona un alumno");
    if (srError) return toast("error", srError);
    const res = await fetch("/api/slot_requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentId: Number(srStudent),
        subjectId: id,
        dayOfWeek: Number(srDay),
        startHour: Number(srStart),
        endHour: Number(srEnd),
      }),
    });
    if (!res.ok) return toast("error", (await res.json().catch(() => ({}))).error || "No se pudo guardar");
    toast("success", "Posibilidad añadida");
    setSrOpen(false);
    await load();
  }

  const memberIds = new Set(members.map((m) => m.studentId));
  const availableStudents = allStudents.filter((s) => !memberIds.has(s.id));
  const defaultDur = subject?.defaultDurationMin ?? 60;

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
    setSubject((s) => (s ? { ...s, scheduleFixed: fixed } : s));
    toast("success", fixed ? "Horario de esta asignatura fijado" : "Horario desbloqueado");
  }

  return (
    <div className="space-y-6">
      <AutoScheduleResultDialog result={autoResult} onClose={() => setAutoResult(null)} />
      <div className="space-y-3">
        <Button asChild variant="outline" size="sm">
          <Link href="/subjects"><ArrowLeft /> Asignaturas</Link>
        </Button>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-56 max-w-full" />
                <Skeleton className="h-4 w-20" />
              </div>
            ) : subject ? (
              <>
                <h1 className="section-title flex items-center gap-2 flex-wrap">
                  <BookOpen className="text-blue-600" /> {subject.name}
                  {subject.isCollective && <Badge variant="success">Colectiva</Badge>}
                </h1>
                <p className="text-gray-500 text-sm mt-1">
                  Sesión de {fmtDurationMin(defaultDur)}
                  {subject.isCollective && " · compartida por todos los alumnos inscritos"}
                </p>
              </>
            ) : (
              <p className="text-gray-500 text-sm">Asignatura no encontrada</p>
            )}
          </div>
          {loading ? (
            <HeaderActionsSkeleton />
          ) : (
            <div className="flex flex-wrap gap-2 items-center">
              {subject && !subject.scheduleFixed && !subject.teacher?.scheduleFixed && (
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={autoScheduleSubject}
                >
                  <Sparkles size={14} /> Auto-agendar
                </Button>
              )}
              <div className="flex items-center gap-2 rounded-lg border border-gray-100 px-3 py-1.5">
                <Label htmlFor="subj-fixed" className="text-xs text-gray-600">Fijar horario</Label>
                <Switch
                  id="subj-fixed"
                  checked={Boolean(subject?.scheduleFixed)}
                  onCheckedChange={toggleScheduleFixed}
                  disabled={busy || !subject}
                />
              </div>
              {subject && (
                <Button asChild variant="outline" size="sm">
                  <Link href="/dashboard"><Briefcase /> {subject.teacher?.name ?? "Mi panel"}</Link>
                </Button>
              )}
              <Button asChild size="sm">
                <Link href="/requests"><ClipboardList /> <span className="hidden sm:inline">Solicitudes de horario</span><span className="sm:hidden">Solicitudes</span></Link>
              </Button>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <>
          <TableCardSkeleton rows={3} />
          <TableCardSkeleton rows={3} />
        </>
      ) : !subject ? null : (<>
      <Card className="p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold flex items-center gap-2"><GraduationCap size={18} className="text-blue-600" /> Alumnos inscritos</h2>
          <Button size="sm" onClick={openAddMember}><Plus size={14} /> Añadir alumno</Button>
        </div>
        
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
                    {!subject.isCollective && (
                      <span className="text-gray-500 text-xs">Duración: {m.durationMin == null ? <span className="italic">{defaultDur} min</span> : `${m.durationMin} min`}</span>
                    )}
                    {!subject.isCollective && (
                      <>
                        <span className="text-gray-500 text-xs">Pedidas: {m.slotsRequired}</span>
                        <Badge variant={reqs.length >= m.slotsRequired ? "success" : "warn"}>{reqs.length}/{m.slotsRequired}</Badge>
                      </>
                    )}
                    {subject.isCollective && reqs.length > 0 && (
                      <Badge variant="gray">{reqs.length} posibilidad(es)</Badge>
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

      {/* Slot requests (posibilidades) */}
      <Card className="p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold flex items-center gap-2"><ClipboardList size={18} className="text-blue-600" /> Posibilidades de horario</h2>
          <Button size="sm" onClick={() => { setSrStudent(""); setSrDay("0"); setSrStart(""); setSrEnd(""); setSrOpen(true); }}>
            <Plus size={14} /> Añadir posibilidad
          </Button>
        </div>
        {slotRequests.length === 0 ? (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-gray-500 text-sm">Sin posibilidades de horario.</p>
            <Button asChild size="sm" variant="outline">
              <Link href="/requests"><ClipboardList /> Gestionar en Solicitudes</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {sortedMembers.map((m) => {
              const reqs = requestsByStudent[m.studentId] ?? [];
              if (reqs.length === 0) return null;
              return (
                <div key={m.id} className="space-y-1.5">
                  <div className="text-sm font-medium text-gray-700">{m.student.name}</div>
                  <Reorder.Group
                    axis="y"
                    values={reqs}
                    onReorder={(next) => handleReorder(next, m.studentId)}
                    layoutScroll
                    className="space-y-1.5 reorder-group"
                  >
                    <AnimatePresence initial={false}>
                      {reqs.map((r, ri) => (
                        <SlotRowItem key={r.id} r={r}>
                          <div className="flex items-center gap-1">
                            <Button size="iconSm" variant="ghost" onClick={() => moveSlot(r.id, "up")} disabled={busy || ri === 0} aria-label="Subir preferencia"><ArrowUp size={12} /></Button>
                            <Button size="iconSm" variant="ghost" onClick={() => moveSlot(r.id, "down")} disabled={busy || ri === reqs.length - 1} aria-label="Bajar preferencia"><ArrowDown size={12} /></Button>
                          </div>
                          <span className="min-w-0 flex-[1_1_100%] sm:flex-1 order-last sm:order-none basis-full sm:basis-auto text-sm leading-snug">{DAYS[r.dayOfWeek]} {fmtRange(r.startHour, r.endHour)}</span>
                          <Button size="iconSm" variant="destructive" onClick={() => setConfirmTarget({ kind: "slot", id: r.id, label: `¿Borrar posibilidad ${DAYS[r.dayOfWeek]} ${fmtRange(r.startHour, r.endHour)}?` })} aria-label="Borrar"><Trash2 size={12} /></Button>
                        </SlotRowItem>
                      ))}
                    </AnimatePresence>
                  </Reorder.Group>
                </div>
              );
            })}
          </div>
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
              <Select value={newStudent} onValueChange={setNewStudent}>
                <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                <SelectContent>
                  {availableStudents.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {!subject?.isCollective && (
                <>
                  <div>
                    <Label htmlFor="m-slots">Solicitudes pedidas (nº de opciones que dará el alumno)</Label>
                    <Input type="number" min={1} value={newSlotsRequired} onChange={(e) => setNewSlotsRequired(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="m-dur">Duración de su clase en minutos</Label>
                    <Input type="number" min={5} step={5} value={newDurationMin} onChange={(e) => setNewDurationMin(e.target.value)} placeholder={String(defaultDur)} />
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

      <Dialog open={editMember != null} onOpenChange={(o) => { if (!o) setEditMember(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar inscripción</DialogTitle>
            <DialogDescription>
              Estás editando a <strong>{editMember?.student.name}</strong> en esta asignatura (no sus datos personales).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-sm">
              <span className="font-semibold">{editMember?.student.name}</span> — ajustes solo para esta asignatura
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {!subject?.isCollective && (
                <>
                  <div>
                    <Label htmlFor="em-slots">Opciones que debe dar ({editMember?.student.name ?? "alumno"})</Label>
                    <Input id="em-slots" type="number" min={1} value={editSlots} onChange={(e) => setEditSlots(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="em-dur2">Duración de SU clase en minutos (vacío = default)</Label>
                    <Input id="em-dur" type="number" min={5} step={5} value={editDuration} onChange={(e) => setEditDuration(e.target.value)} placeholder={String(defaultDur)} />
                  </div>
                </>
              )}
            </div>
            {subject?.isCollective ? (
              <p className="text-xs text-gray-500">En asignaturas colectivas la duración es común: {fmtDurationMin(defaultDur)}.</p>
            ) : (
              <p className="text-xs text-gray-500">El orden entre alumnos se gestiona con las flechas de la lista, no aquí.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditMember(null)}><X size={14} /> Cancelar</Button>
            <Button onClick={submitEditMember}><Save size={14} /> Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={srOpen} onOpenChange={setSrOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Añadir posibilidad de horario</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="sd-alumno-1">Alumno</Label>
              <Select value={srStudent} onValueChange={setSrStudent}>
                <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                <SelectContent>
                  {members.map((m) => <SelectItem key={m.studentId} value={String(m.studentId)}>{m.student.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label htmlFor="sr-day">Día</Label>
                <Select value={srDay} onValueChange={setSrDay}>
                  <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                  <SelectContent>
                    {DAYS.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="sr-start">Hora de inicio</Label>
                <Select value={srStart} onValueChange={setSrStart}>
                  <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                  <SelectContent>
                    {HOURS_START.map((o) => hourItem(o, srHourSets.startSet))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="sr-end">Hora de fin</Label>
                <Select value={srEnd} onValueChange={setSrEnd}>
                  <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                  <SelectContent>
                    {HOURS_END.map((o) => hourItem(o, srHourSets.endSet))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {srHourSets.ranges.length === 0 && srStudent && (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                No hay horas compatibles para este alumno. Define su disponibilidad en Alumnos.
              </p>
            )}
            <p className="text-xs text-gray-500">Deben caer dentro de la disponibilidad del profesor y del horario disponible del alumno.</p>
            {srError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{srError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSrOpen(false)}><X size={14} /> Cancelar</Button>
            <Button onClick={submitSr}><Save size={14} /> Añadir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmTarget !== null} onOpenChange={(o) => { if (!o) setConfirmTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar</AlertDialogTitle>
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