"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Save, X, GraduationCap, Ban, Calendar } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useToast } from "@/components/Toast";
import PageHeader from "@/components/PageHeader";
import { BadgeGroupSkeleton, TableCardSkeleton } from "@/components/skeletons";
import { warmData, put, invalidate, invalidateMany } from "@/lib/clientCache";
import { DAYS } from "@/lib/validate";
import { fmtDayRange, hourOptions } from "@/lib/hours";
import StudentAvailabilityDialog from "@/components/StudentAvailabilityDialog";
import type { TimeRange } from "@/lib/studentAvailability";

interface Subject { id: number; name: string; }
interface Blocked { day: number; start: number; end: number; }
interface Student { id: number; name: string; email?: string | null; grade?: string | null; blockedRanges?: Blocked[]; availableRanges?: TimeRange[]; }
interface SSRow { id: number; subjectId: number; studentId: number; }

type BlockMode = "student" | "grade" | "multiple";

export default function StudentsClient() {
  const toast = useToast();
  const [students, setStudents] = useState<Student[] | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);

  // dialog crear/editar alumno
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [fName, setFName] = useState("");
  const [fGrade, setFGrade] = useState("");
  const [fEmail, setFEmail] = useState("");
  const [selSubjects, setSelSubjects] = useState<Set<number>>(new Set());
  const [initialSubjects, setInitialSubjects] = useState<Set<number>>(new Set());
  const [slotsPer, setSlotsPer] = useState("3");

  // dialog bloquear (unificado)
  const [bOpen, setBOpen] = useState(false);
  const [bMode, setBMode] = useState<BlockMode>("student");
  const [bStudent, setBStudent] = useState("");
  const [bGrade, setBGrade] = useState("");
  const [bGroup, setBGroup] = useState<Set<number>>(new Set());
  const [bDay, setBDay] = useState("0");
  const [bStart, setBStart] = useState("");
  const [bEnd, setBEnd] = useState("");

  const [confirmDel, setConfirmDel] = useState<Student | null>(null);
  const [saving, setSaving] = useState(false);

  // dialog disponibilidad
  const [availOpen, setAvailOpen] = useState(false);
  const [availStudent, setAvailStudent] = useState<Student | null>(null);

  async function load(force = false) {
    if (!force) {
      const c = warmData<Student[]>("/api/students");
      if (c !== null) {
        const su = warmData<Subject[]>("/api/subjects") ?? [];
        setStudents(c);
        setSubjects(su);
        return;
      }
    }
    const [st, su] = await Promise.all([
      fetch("/api/students").then((r) => r.json()) as Promise<Student[]>,
      fetch("/api/subjects").then((r) => r.json()) as Promise<Subject[]>,
    ]);
    setStudents(st);
    setSubjects(su);
    put("/api/students", st);
    put("/api/subjects", su);
  }
  useEffect(() => { load(); }, []);

  const grades = useMemo(
    () => Array.from(new Set((students ?? []).map((s) => (s.grade ?? "").trim()).filter(Boolean))).sort(),
    [students]
  );

  function openNew() {
    setEditing(null);
    setFName(""); setFGrade(""); setFEmail("");
    setSelSubjects(new Set());
    setInitialSubjects(new Set());
    setSlotsPer("3");
    setEditOpen(true);
  }

  async function openEdit(s: Student) {
    setEditing(s);
    setFName(s.name); setFGrade(s.grade ?? ""); setFEmail(s.email ?? "");
    const rows = await fetch(`/api/subject_students?studentId=${s.id}`).then((r) => r.json()) as SSRow[];
    const subs = new Set(rows.map((r) => r.subjectId));
    setSelSubjects(subs);
    setInitialSubjects(subs);
    setSlotsPer("3");
    setEditOpen(true);
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

  function overlapErr(): string {
    if (bStart === "" || bEnd === "") return "";
    if (!(Number(bEnd) > Number(bStart))) return "La hora de fin debe ser posterior a la de inicio";
    return "";
  }
  const bErr = overlapErr();

  function targetsForBlock(): Student[] {
    const arr = students ?? [];
    if (bMode === "student") return arr.filter((s) => String(s.id) === bStudent);
    if (bMode === "grade") return arr.filter((s) => (s.grade ?? "").trim() === bGrade);
    return arr.filter((s) => bGroup.has(s.id));
  }

  async function saveBlock() {
    if (bErr) return toast("error", bErr);
    const targets = targetsForBlock();
    if (targets.length === 0) return toast("error", "Selecciona a quién afecta");
    setSaving(true);
    let touched = 0;
    for (const st of targets) {
      const cur = st.blockedRanges ?? [];
      const dup = cur.some((b) => b.day === Number(bDay) && Number(bEnd) > b.start && Number(bStart) < b.end);
      if (dup) continue;
      const nr = [...cur, { day: Number(bDay), start: Number(bStart), end: Number(bEnd) }];
      const res = await fetch("/api/students", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: st.id, name: st.name, email: st.email ?? "", grade: st.grade ?? "", blockedRanges: nr }),
      });
      if (res.ok) touched++;
    }
    setSaving(false);
    setBOpen(false);
    toast("success", `Hora bloqueada para ${touched} alumno(s)`);
    await load();
  }

  async function removeBlocked(s: Student, idx: number) {
    const nr = (s.blockedRanges ?? []).filter((_, i) => i !== idx);
    const res = await fetch("/api/students", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: s.id, name: s.name, email: s.email ?? "", grade: s.grade ?? "", blockedRanges: nr }),
    });
    if (!res.ok) return toast("error", (await res.json().catch(() => ({}))).error || "Error");
    toast("success", "Hora desbloqueada");
    await load();
  }

  async function saveStudent() {
    if (!fName.trim()) return toast("error", "Falta el nombre");
    if (
      editing &&
      fName.trim() === editing.name &&
      fGrade.trim() === (editing.grade ?? "") &&
      fEmail.trim() === (editing.email ?? "") &&
      subjectsEqual(selSubjects, initialSubjects)
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
      return toast("error", (await res.json().catch(() => ({}))).error || "Error");
    }
    const saved: Student = await res.json();
    // sincronizar asignaturas (multi-select)
    const rows = await fetch(`/api/subject_students?studentId=${saved.id}`).then((r) => r.json()) as SSRow[];
    for (const sub of subjects) {
      const row = rows.find((r) => r.subjectId === sub.id);
      const want = selSubjects.has(sub.id);
      if (want && !row) {
        const linkRes = await fetch("/api/subject_students", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subjectId: sub.id, studentId: saved.id, slotsRequired: Number(slotsPer) || 1 }),
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
    setSaving(false);
    setEditOpen(false);
    toast("success", editing ? "Alumno actualizado" : "Alumno creado");
    invalidateMany(["/api/students", "/api/subject_students", "/api/subjects"]);
    await load(true);
  }

  async function saveAvailability(ranges: TimeRange[]) {
    if (!availStudent) return;
    setSaving(true);
    const res = await fetch("/api/students", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: availStudent.id,
        name: availStudent.name,
        email: availStudent.email ?? "",
        grade: availStudent.grade ?? "",
        availableRanges: ranges,
      }),
    });
    setSaving(false);
    if (!res.ok) return toast("error", (await res.json().catch(() => ({}))).error || "Error");
    toast("success", "Disponibilidad guardada");
    setAvailOpen(false);
    await load(true);
  }

  function openAvailability(s: Student) {
    setAvailStudent(s);
    setAvailOpen(true);
  }

  async function doDelete() {
    if (!confirmDel) return;
    const res = await fetch(`/api/students?id=${confirmDel.id}`, { method: "DELETE" });
    setConfirmDel(null);
    if (!res.ok) return toast("error", "No se pudo borrar");
    invalidate("/api/students"); invalidate("/api/subject_students"); toast("success", "Alumno borrado");
    await load();
  }

  return (
    <div className="space-y-4">
      <PageHeader
        icon={GraduationCap}
        title="Alumnos"
        description="Gestiona alumnos y restricciones de horario."
        actions={
          <>
            <Button variant="outline" onClick={() => { setBMode("student"); setBStudent(""); setBGrade(""); setBGroup(new Set()); setBDay("0"); setBStart("16"); setBEnd("18"); setBOpen(true); }}>
              <Ban size={16} /> <span className="hidden sm:inline">Bloquear horas</span>
            </Button>
            <Button onClick={openNew}>
              <Plus size={16} />
              <span className="hidden sm:inline">Nuevo alumno</span>
            </Button>
          </>
        }
      />

      {students === null ? (
        <TableCardSkeleton rows={5} />
      ) : (
      <>
      <Card className="p-5 overflow-x-auto">
        {students.length === 0 ? (
          <div className="text-gray-400 text-sm">No hay alumnos aún</div>
        ) : (
          <table className="w-full text-sm rtable">
            <thead>
              <tr className="text-left border-b border-gray-100">
                <th className="py-2 pr-4 font-medium text-gray-600">Nombre</th>
                <th className="py-2 pr-4 font-medium text-gray-600">Curso</th>
                <th className="py-2 pr-4 font-medium text-gray-600">Asignaturas</th>
                <th className="py-2 pr-4 font-medium text-gray-600">Disponibilidad</th>
                <th className="py-2 pr-4 font-medium text-gray-600">Horas bloqueadas</th>
                <th className="py-2 font-medium text-gray-600 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id} className="border-b border-gray-50">
                  <td className="py-2 pr-4 font-medium" data-label="Nombre">{s.name}</td>
                  <td className="py-2 pr-4" data-label="Curso">{s.grade || "—"}</td>
                  <td className="py-2 pr-4" data-label="Asignaturas">
                    <StudentSubjects studentId={s.id} subjects={subjects} />
                  </td>
                  <td className="py-2 pr-4" data-label="Disponibilidad">
                    {(s.availableRanges ?? []).length === 0 ? (
                      <span className="text-gray-400 text-xs">sin definir</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {(s.availableRanges ?? []).slice(0, 3).map((b, i) => (
                          <Badge key={i} variant="success" className="font-normal">
                            {fmtDayRange(b.day, b.start, b.end)}
                          </Badge>
                        ))}
                        {(s.availableRanges ?? []).length > 3 && (
                          <span className="text-xs text-gray-500">+{(s.availableRanges ?? []).length - 3}</span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="py-2 pr-4" data-label="Horas bloqueadas">
                    {(s.blockedRanges ?? []).length === 0 ? (
                      <span className="text-gray-400 text-xs">ninguna</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {(s.blockedRanges ?? []).map((b, i) => (
                          <span key={i} className="inline-flex items-center gap-1 text-xs bg-red-50 text-red-700 border border-red-100 rounded-full pl-2 pr-1 py-0.5">
                            {fmtDayRange(b.day, b.start, b.end)}
                            <button onClick={() => removeBlocked(s, i)} className="inline-flex items-center justify-center w-5 h-5 rounded-full hover:bg-red-100" aria-label="Quitar bloqueo"><X size={11} /></button>
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="py-2" data-actions>
                    <div className="flex gap-1.5 justify-end">
                      <Button size="iconSm" variant="outline" onClick={() => openAvailability(s)} aria-label="Horario y disponibilidad" title="Ver horario y disponibilidad">
                        <Calendar size={14} />
                      </Button>
                      <Button size="iconSm" variant="outline" onClick={() => openEdit(s)} aria-label="Editar"><Pencil size={14} /></Button>
                      <Button size="iconSm" variant="destructive" onClick={() => setConfirmDel(s)} aria-label="Borrar"><Trash2 size={14} /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      </>
      )}

      {/* Dialog: crear/editar alumno con asignaturas */}
      <Dialog open={editOpen} onOpenChange={(o) => { if (!o) setEditOpen(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar alumno" : "Nuevo alumno"}</DialogTitle>
            <DialogDescription>
              {editing
                ? <>Editando a <strong>{editing.name}</strong>: datos, asignaturas donde está y sus horas bloqueadas.</>
                : "Datos del alumno y en qué asignaturas entra."}
            </DialogDescription>
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
                    <label key={sub.id} className="flex items-center gap-2.5 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-blue-600"
                        checked={selSubjects.has(sub.id)}
                        onChange={() => toggleSub(sub.id)}
                      />
                      <span className="font-medium">{sub.name}</span>
                    </label>
                  ))}
                </div>
              )}
              <div className="mt-3">
                <Label htmlFor="f-slots">Horarios que debe proponer por asignatura</Label>
                <Input id="f-slots" className="w-28" type="number" min={1} max={10} value={slotsPer} onChange={(e) => setSlotsPer(e.target.value)} />
                <p className="text-xs text-gray-500 mt-1">Nº de opciones de día y hora que dará el alumno para cada asignatura.</p>
              </div>
            </div>
            {editing && (editing.blockedRanges ?? []).length > 0 && (
              <div>
                <Label htmlFor="f-blocked">Horas bloqueadas</Label>
                <div className="flex flex-wrap gap-1 mt-1">
                  {editing.blockedRanges!.map((b, i) => (
                    <span key={i} className="inline-flex items-center gap-1 text-xs bg-red-50 text-red-700 border border-red-100 rounded-full pl-2 pr-1 py-0.5">
                      {fmtDayRange(b.day, b.start, b.end)}
                      <button onClick={() => removeBlocked(editing, i)} className="inline-flex items-center justify-center w-5 h-5 rounded-full hover:bg-red-100" aria-label="Quitar"><X size={11} /></button>
                    </span>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-1">Guarda primero para refrescar la lista al quitar.</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setEditOpen(false)}><X size={14} /> Cancelar</Button>
            <Button onClick={saveStudent} disabled={saving}><Save size={14} /> {editing ? "Guardar" : "Crear"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: bloquear horas (alumno / curso / grupo) */}
      <Dialog open={bOpen} onOpenChange={(o) => { if (!o) setBOpen(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bloquear horas</DialogTitle>
            <DialogDescription>
              Esas horas quedan ocupadas: no se podrán pedir como posibilidad y el auto-agendado las respetará.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="b-mode">¿A quién afecta?</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                <button type="button" onClick={() => setBMode("student")} className={`chip ${bMode === "student" ? "chip-active" : ""}`}>Un alumno</button>
                <button type="button" onClick={() => setBMode("grade")} className={`chip ${bMode === "grade" ? "chip-active" : ""}`}>Un curso entero</button>
                <button type="button" onClick={() => setBMode("multiple")} className={`chip ${bMode === "multiple" ? "chip-active" : ""}`}>Varios alumnos</button>
              </div>
            </div>
            {bMode === "student" && (
              <div>
                <Label htmlFor="b-student">Alumno</Label>
                <Select value={bStudent} onValueChange={setBStudent}>
                  <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                  <SelectContent>
                    {(students ?? []).map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}{s.grade ? ` · ${s.grade}` : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {bMode === "grade" && (
              <div>
                <Label htmlFor="b-grade">Curso</Label>
                {grades.length === 0 ? (
                  <p className="text-xs text-gray-500">Ningún alumno tiene curso asignado todavía.</p>
                ) : (
                  <Select value={bGrade} onValueChange={setBGrade}>
                    <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                    <SelectContent>
                      {grades.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}
            {bMode === "multiple" && (
              <div>
                <Label htmlFor="b-multi">Alumnos (selección múltiple)</Label>
                <div className="space-y-1.5 mt-1" style={{ maxHeight: "34dvh" }}>
                  {(students ?? []).map((s) => (
                    <label key={s.id} className="flex items-center gap-2.5 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-blue-600"
                        checked={bGroup.has(s.id)}
                        onChange={() => setBGroup((prev) => {
                          const n = new Set(prev);
                          if (n.has(s.id)) n.delete(s.id); else n.add(s.id);
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label htmlFor="b-day">Día</Label>
                <Select value={bDay} onValueChange={setBDay}>
                  <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                  <SelectContent>
                    {DAYS.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="b-start">Hora de inicio</Label>
                <Select value={bStart} onValueChange={setBStart}>
                  <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                  <SelectContent>
                    {hourOptions(8, 23).map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="b-end">Hora de fin</Label>
                <Select value={bEnd} onValueChange={setBEnd}>
                  <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                  <SelectContent>
                    {hourOptions(9, 24).map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {bErr && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{bErr}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBOpen(false)}><X size={14} /> Cancelar</Button>
            <Button onClick={saveBlock} disabled={saving}><Ban size={14} /> Bloquear</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <StudentAvailabilityDialog
        open={availOpen}
        onOpenChange={setAvailOpen}
        student={availStudent}
        subjects={subjects}
        onSave={saveAvailability}
        saving={saving}
      />

      {/* Confirmar borrado de alumno */}
      <AlertDialog open={confirmDel !== null} onOpenChange={(o) => { if (!o) setConfirmDel(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar borrado</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Borrar a <strong>{confirmDel?.name}</strong>? Se borran también sus posibilidades, inscripciones y clases.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete}>Borrar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StudentSubjects({ studentId, subjects }: { studentId: number; subjects: Subject[] }) {
  const [rows, setRows] = useState<SSRow[] | null>(() => {
    const all = warmData<SSRow[]>("/api/subject_students");
    return all ? all.filter((x) => x.studentId === studentId) : null;
  });
  useEffect(() => {
    let alive = true;
    fetch(`/api/subject_students?studentId=${studentId}`)
      .then((r) => r.json())
      .then((r: SSRow[]) => {
        if (alive) {
          setRows(r);
          put(`/api/ss:student:${studentId}`, r);
        }
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [studentId]);
  if (rows === null) return <BadgeGroupSkeleton />;
  if (rows.length === 0) return <Badge variant="gray">sin asignaturas</Badge>;
  return (
    <div className="flex flex-wrap gap-1">
      {rows.map((r) => (
        <Badge key={r.id}>{subjects.find((x) => x.id === r.subjectId)?.name ?? `#${r.subjectId}`}</Badge>
      ))}
    </div>
  );
}