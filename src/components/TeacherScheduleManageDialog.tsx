"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarClock, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { DAYS } from "@/lib/validate";
import { fmtDayRange, SCHEDULE_HOURS_START, SCHEDULE_HOURS_END, endIfAfterStart } from "@/lib/hours";
import {
  getFreeHourSetsForDays,
  slotOverlapsBlocked,
  type TimeRange,
} from "@/lib/studentAvailability";

function toggleId(prev: Set<number>, id: number) {
  const n = new Set(prev);
  if (n.has(id)) n.delete(id); else n.add(id);
  return n;
}

interface Availability { id: number; dayOfWeek: number; startHour: number; endHour: number; }
interface TeacherBlock { id: number; title: string; dayOfWeek: number; startHour: number; endHour: number; }

interface DisplayAssignment {
  id: number;
  studentName: string;
  subjectName: string;
  dayOfWeek: number;
  startHour: number;
  endHour: number;
  collectiveSessionId?: string | null;
}

interface TeacherScheduleManageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  availabilities: Availability[];
  teacherBlocks: TeacherBlock[];
  assignments?: { dayOfWeek: number; startHour: number; endHour: number }[];
  displayAssignments?: DisplayAssignment[];
  saving?: boolean;
  onApplyAvailability: (args: { removeIds: number[]; adds: TimeRange[] }) => Promise<boolean>;
  onApplyBlocks: (args: { removeIds: number[]; create?: { days: number[]; start: number; end: number; title: string } }) => Promise<boolean>;
  onAddStudentClass?: () => void;
}

const HOURS_START = SCHEDULE_HOURS_START;
const HOURS_END = SCHEDULE_HOURS_END;

function blocksToRanges(blocks: TeacherBlock[]): TimeRange[] {
  return blocks.map((b) => ({ day: b.dayOfWeek, start: b.startHour, end: b.endHour }));
}

type View = "main" | "add-avail" | "add-block";

export default function TeacherScheduleManageDialog({
  open, onOpenChange, availabilities, teacherBlocks, assignments = [],
  displayAssignments = [], saving = false, onApplyAvailability, onApplyBlocks, onAddStudentClass,
}: TeacherScheduleManageDialogProps) {
  const [view, setView] = useState<View>("main");

  /* ─ Availability state ─ */
  const [removeAvail, setRemoveAvail] = useState<Set<number>>(new Set());
  const [editAvailId, setEditAvailId] = useState<number | null>(null);
  const [availEdits, setAvailEdits] = useState<Record<number, { day: number; start: number; end: number }>>({});

  /* ─ Block state ─ */
  const [removeBlocks, setRemoveBlocks] = useState<Set<number>>(new Set());
  const [editBlockId, setEditBlockId] = useState<number | null>(null);
  const [blockEdits, setBlockEdits] = useState<Record<number, { title: string; day: number; start: number; end: number }>>({});

  /* ─ Add availability form ─ */
  const [avDays, setAvDays] = useState<Set<number>>(new Set());
  const [avStart, setAvStart] = useState("");
  const [avEnd, setAvEnd] = useState("");

  /* ─ Add block form ─ */
  const [blkTitle, setBlkTitle] = useState("");
  const [blkDays, setBlkDays] = useState<Set<number>>(new Set());
  const [blkStart, setBlkStart] = useState("");
  const [blkEnd, setBlkEnd] = useState("");

  const [addErr, setAddErr] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const busy = saving || submitting;

  const blockedRanges = useMemo(() => blocksToRanges(teacherBlocks.filter((b) => !removeBlocks.has(b.id))), [teacherBlocks, removeBlocks]);
  const occupiedRanges = useMemo(
    () => [...blockedRanges, ...assignments.map((a) => ({ day: a.dayOfWeek, start: a.startHour, end: a.endHour }))],
    [blockedRanges, assignments],
  );

  const avHourSets = useMemo(
    () => getFreeHourSetsForDays([...avDays], blockedRanges, HOURS_START, HOURS_END, avStart || undefined),
    [avDays, blockedRanges, avStart],
  );

  const blkHourSets = useMemo(
    () => getFreeHourSetsForDays([...blkDays], occupiedRanges, HOURS_START, HOURS_END, blkStart || undefined),
    [blkDays, occupiedRanges, blkStart],
  );

  useEffect(() => {
    if (!open) return;
    setView("main");
    setRemoveAvail(new Set()); setAvailEdits({}); setEditAvailId(null);
    setRemoveBlocks(new Set()); setBlockEdits({}); setEditBlockId(null);
    resetAvForm(); resetBlkForm(); setAddErr("");
  }, [open]);

  useEffect(() => { setAddErr(""); }, [avDays, avStart, avEnd, blkDays, blkStart, blkEnd, blkTitle]);

  // Auto-clear invalid hour selections when filtered sets change
  useEffect(() => {
    if (avStart && avHourSets.startSet.size > 0 && !avHourSets.startSet.has(avStart)) setAvStart("");
  }, [avHourSets.startSet, avStart]);
  useEffect(() => {
    if (avEnd && (avHourSets.endSet.size === 0 || !avHourSets.endSet.has(avEnd))) setAvEnd("");
  }, [avHourSets.endSet, avEnd]);
  useEffect(() => {
    if (blkStart && blkHourSets.startSet.size > 0 && !blkHourSets.startSet.has(blkStart)) setBlkStart("");
  }, [blkHourSets.startSet, blkStart]);
  useEffect(() => {
    if (blkEnd && (blkHourSets.endSet.size === 0 || !blkHourSets.endSet.has(blkEnd))) setBlkEnd("");
  }, [blkHourSets.endSet, blkEnd]);

  function resetAvForm() { setAvDays(new Set()); setAvStart(""); setAvEnd(""); }
  function resetBlkForm() { setBlkTitle(""); setBlkDays(new Set()); setBlkStart(""); setBlkEnd(""); }

  function goBack() { setView("main"); setAddErr(""); }

  function hourItem(o: { value: string; label: string }, allowed: Set<string>) {
    if (!allowed.has(o.value)) return null;
    return <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>;
  }

  /* ─ Add availability ─ */
  async function submitAvail() {
    if (avDays.size === 0) { setAddErr("Selecciona al menos un día"); return; }
    if (avHourSets.startSet.size === 0) { setAddErr("No hay horas libres en los días seleccionados. Hay bloqueos que ocupan todo el horario."); return; }
    if (!avStart || !avEnd) { setAddErr("Selecciona inicio y fin"); return; }
    const s = Number(avStart), e = Number(avEnd);
    if (!(e > s)) { setAddErr("La hora de fin debe ser posterior"); return; }
    const adds: TimeRange[] = [];
    for (const day of avDays) {
      if (slotOverlapsBlocked(day, s, e, blockedRanges)) {
        const hit = teacherBlocks.find((b) => b.dayOfWeek === day && b.endHour > s && b.startHour < e);
        setAddErr(`Choca con ${hit?.title ?? "un bloqueo"} el ${DAYS[day]}`);
        return;
      }
      adds.push({ day, start: s, end: e });
    }
    setSubmitting(true);
    try {
      const ok = await onApplyAvailability({ removeIds: [], adds });
      if (!ok) return;
      resetAvForm(); setAddErr(""); setView("main");
    } finally { setSubmitting(false); }
  }

  /* ─ Add block ─ */
  async function submitBlock() {
    if (!blkTitle.trim()) { setAddErr("El motivo es obligatorio"); return; }
    if (blkDays.size === 0) { setAddErr("Selecciona al menos un día"); return; }
    if (blkHourSets.startSet.size === 0) { setAddErr("No hay horas libres en los días seleccionados. Hay bloqueos o clases que ocupan todo el horario."); return; }
    if (!blkStart || !blkEnd) { setAddErr("Selecciona inicio y fin"); return; }
    const s = Number(blkStart), e = Number(blkEnd);
    if (!(e > s)) { setAddErr("La hora de fin debe ser posterior"); return; }
    setSubmitting(true);
    try {
      const ok = await onApplyBlocks({ removeIds: [], create: { days: [...blkDays], start: s, end: e, title: blkTitle.trim() } });
      if (!ok) return;
      resetBlkForm(); setAddErr(""); setView("main");
    } finally { setSubmitting(false); }
  }

  /* ─ Save edits/removals from main view ─ */
  const hasAvailChanges = removeAvail.size > 0 || Object.keys(availEdits).length > 0;
  const hasBlockChanges = removeBlocks.size > 0 || Object.keys(blockEdits).length > 0;
  const canSaveMain = hasAvailChanges || hasBlockChanges;

  async function saveMain() {
    if (busy || !canSaveMain) return;
    setSubmitting(true);
    try {
      if (hasAvailChanges) {
        const editedIds = Object.keys(availEdits).map(Number);
        const allRemoveIds = [...removeAvail, ...editedIds.filter((id) => !removeAvail.has(id))];
        const editedAdds: TimeRange[] = editedIds.filter((id) => !removeAvail.has(id)).map((id) => {
          const ed = availEdits[id]; return { day: ed.day, start: ed.start, end: ed.end };
        });
        const ok = await onApplyAvailability({ removeIds: allRemoveIds, adds: editedAdds });
        if (!ok) return;
      }
      if (hasBlockChanges) {
        const editedBlockIds = Object.keys(blockEdits).map(Number);
        const allRemoveBlockIds = [...removeBlocks, ...editedBlockIds.filter((id) => !removeBlocks.has(id))];
        const ok = await onApplyBlocks({ removeIds: allRemoveBlockIds });
        if (!ok) return;
        for (const id of editedBlockIds.filter((id) => !removeBlocks.has(id))) {
          const ed = blockEdits[id];
          const ok2 = await onApplyBlocks({ removeIds: [], create: { days: [ed.day], start: ed.start, end: ed.end, title: ed.title } });
          if (!ok2) return;
        }
      }
      onOpenChange(false);
    } finally { setSubmitting(false); }
  }

  const editingAvail = editAvailId != null ? availabilities.find((a) => a.id === editAvailId) : null;
  const editingBlock = editBlockId != null ? teacherBlocks.find((b) => b.id === editBlockId) : null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onOpenChange(false); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {view !== "main" && (
              <button type="button" onClick={goBack} className="inline-flex items-center justify-center w-7 h-7 rounded-md hover:bg-gray-100 -ml-1 mr-0.5" aria-label="Atrás">
                <ArrowLeft size={16} />
              </button>
            )}
            <CalendarClock size={18} className="text-blue-600" />
            {view === "main" && "Mi calendario"}
            {view === "add-avail" && "Añadir disponibilidad"}
            {view === "add-block" && "Añadir bloqueo"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto" style={{ maxHeight: "62dvh" }}>

          {/* ══════ VISTA PRINCIPAL ══════ */}
          {view === "main" && (
            <>
              {/* Disponibilidad */}
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">Disponibilidad</Label>
                  <Button type="button" variant="outline" size="sm" onClick={() => { resetAvForm(); setView("add-avail"); }}>
                    <Plus size={14} /> Añadir
                  </Button>
                </div>
                {availabilities.length === 0 ? (
                  <p className="text-xs text-gray-500">Sin disponibilidad definida.</p>
                ) : (
                  <div className="space-y-1.5">
                    {availabilities.map((a) => {
                      const marked = removeAvail.has(a.id);
                      const edited = availEdits[a.id];
                      const shown = edited ?? { day: a.dayOfWeek, start: a.startHour, end: a.endHour };
                      return (
                        <div key={a.id} className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${marked ? "opacity-50 line-through border-red-200 bg-red-50" : "border-emerald-200 bg-emerald-50"}`}>
                          <p className="min-w-0 flex-1 text-sm font-medium truncate">{fmtDayRange(shown.day, shown.start, shown.end)}</p>
                          <div className="flex items-center gap-1">
                            <Button size="iconSm" variant="outline" disabled={marked} onClick={() => setEditAvailId(a.id)} title="Editar"><Pencil size={14} /></Button>
                            <Button size="iconSm" variant="destructive" onClick={() => { setRemoveAvail((p) => toggleId(p, a.id)); if (!marked) setAvailEdits((p) => { const { [a.id]: _, ...rest } = p; return rest; }); }} title={marked ? "Deshacer" : "Quitar"}><Trash2 size={14} /></Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              <hr className="border-gray-100" />

              {/* Bloqueos */}
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">Bloqueos</Label>
                  <Button type="button" variant="outline" size="sm" onClick={() => { resetBlkForm(); setView("add-block"); }}>
                    <Plus size={14} /> Añadir
                  </Button>
                </div>
                {teacherBlocks.length === 0 ? (
                  <p className="text-xs text-gray-500">Sin bloqueos.</p>
                ) : (
                  <div className="space-y-1.5">
                    {teacherBlocks.map((b) => {
                      const marked = removeBlocks.has(b.id);
                      const edited = blockEdits[b.id];
                      const shown = edited ?? { title: b.title, day: b.dayOfWeek, start: b.startHour, end: b.endHour };
                      return (
                        <div key={b.id} className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${marked ? "opacity-50 line-through border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{shown.title}</p>
                            <p className="text-xs text-gray-500 truncate">{fmtDayRange(shown.day, shown.start, shown.end)}</p>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button size="iconSm" variant="outline" disabled={marked} onClick={() => setEditBlockId(b.id)} title="Editar"><Pencil size={14} /></Button>
                            <Button size="iconSm" variant="destructive" onClick={() => { setRemoveBlocks((p) => toggleId(p, b.id)); if (!marked) setBlockEdits((p) => { const { [b.id]: _, ...rest } = p; return rest; }); }} title={marked ? "Deshacer" : "Quitar"}><Trash2 size={14} /></Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* Clases de alumnos */}
              {displayAssignments.length > 0 && (
                <>
                  <hr className="border-gray-100" />
                  <section className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-semibold">Clases de alumnos</Label>
                      {onAddStudentClass && (
                        <Button type="button" variant="outline" size="sm" onClick={() => { onOpenChange(false); onAddStudentClass(); }}>
                          <Plus size={14} /> Añadir
                        </Button>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      {displayAssignments.map((a) => (
                        <div key={a.id} className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">
                              {a.subjectName} · {a.studentName}
                              {a.collectiveSessionId ? <span className="text-xs text-blue-500 ml-1">(colectiva)</span> : null}
                            </p>
                            <p className="text-xs text-gray-500 truncate">{fmtDayRange(a.dayOfWeek, a.startHour, a.endHour)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                </>
              )}

              {displayAssignments.length === 0 && onAddStudentClass && (
                <>
                  <hr className="border-gray-100" />
                  <section className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-semibold">Clases de alumnos</Label>
                      <Button type="button" variant="outline" size="sm" onClick={() => { onOpenChange(false); onAddStudentClass(); }}>
                        <Plus size={14} /> Añadir
                      </Button>
                    </div>
                    <p className="text-xs text-gray-500">Sin clases asignadas.</p>
                  </section>
                </>
              )}
            </>
          )}

          {/* ══════ AÑADIR DISPONIBILIDAD ══════ */}
          {view === "add-avail" && (
            <div className="space-y-3">
              <div>
                <Label>Días</Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {DAYS.map((d, i) => (
                    <label key={i} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-sm cursor-pointer transition-colors ${avDays.has(i) ? "bg-[#eff6ff] border-[var(--accent)] text-[var(--accent)]" : "bg-white border-gray-200 text-gray-700"}`}>
                      <Checkbox size="sm" checked={avDays.has(i)} onChange={() => setAvDays((p) => toggleId(p, i))} />{d}
                    </label>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Desde</Label>
                  <Select value={avStart || undefined} onValueChange={(v) => { setAvStart(v); setAvEnd((e) => endIfAfterStart(v, e)); }} disabled={avDays.size === 0 || avHourSets.startSet.size === 0}>
                    <SelectTrigger><SelectValue placeholder="…" /></SelectTrigger>
                    <SelectContent>{HOURS_START.map((o) => hourItem(o, avHourSets.startSet))}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Hasta</Label>
                  <Select value={avEnd || undefined} onValueChange={setAvEnd} disabled={!avStart || avHourSets.endSet.size === 0}>
                    <SelectTrigger><SelectValue placeholder="…" /></SelectTrigger>
                    <SelectContent>{HOURS_END.map((o) => hourItem(o, avHourSets.endSet))}</SelectContent>
                  </Select>
                </div>
              </div>
              {addErr && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{addErr}</p>}
            </div>
          )}

          {/* ══════ AÑADIR BLOQUEO ══════ */}
          {view === "add-block" && (
            <div className="space-y-3">
              <div>
                <Label>Motivo</Label>
                <Input value={blkTitle} onChange={(e) => setBlkTitle(e.target.value)} placeholder="Ej: Reunión de departamento" />
              </div>
              <div>
                <Label>Días</Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {DAYS.map((d, i) => (
                    <label key={i} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-sm cursor-pointer transition-colors ${blkDays.has(i) ? "bg-[#eff6ff] border-[var(--accent)] text-[var(--accent)]" : "bg-white border-gray-200 text-gray-700"}`}>
                      <Checkbox size="sm" checked={blkDays.has(i)} onChange={() => setBlkDays((p) => toggleId(p, i))} />{d}
                    </label>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Desde</Label>
                  <Select value={blkStart || undefined} onValueChange={(v) => { setBlkStart(v); setBlkEnd((e) => endIfAfterStart(v, e)); }} disabled={blkDays.size === 0 || blkHourSets.startSet.size === 0}>
                    <SelectTrigger><SelectValue placeholder="…" /></SelectTrigger>
                    <SelectContent>{HOURS_START.map((o) => hourItem(o, blkHourSets.startSet))}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Hasta</Label>
                  <Select value={blkEnd || undefined} onValueChange={setBlkEnd} disabled={!blkStart || blkHourSets.endSet.size === 0}>
                    <SelectTrigger><SelectValue placeholder="…" /></SelectTrigger>
                    <SelectContent>{HOURS_END.map((o) => hourItem(o, blkHourSets.endSet))}</SelectContent>
                  </Select>
                </div>
              </div>
              {addErr && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{addErr}</p>}
            </div>
          )}
        </div>

        <DialogFooter>
          {view === "main" && canSaveMain && (
            <Button onClick={saveMain} loading={busy}><Save size={14} /> Guardar cambios</Button>
          )}
          {view === "add-avail" && (
            <>
              <Button variant="outline" onClick={goBack} disabled={busy}><X size={14} /> Cancelar</Button>
              <Button onClick={submitAvail} loading={busy}><Plus size={14} /> Añadir franja{avDays.size > 1 ? "s" : ""}</Button>
            </>
          )}
          {view === "add-block" && (
            <>
              <Button variant="outline" onClick={goBack} disabled={busy}><X size={14} /> Cancelar</Button>
              <Button onClick={submitBlock} loading={busy}><Plus size={14} /> Añadir bloqueo{blkDays.size > 1 ? "s" : ""}</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>

      {/* Sub-diálogos de edición */}
      {editingAvail && (
        <EditDialog
          open title="Editar disponibilidad" iconColor="text-emerald-600"
          onOpenChange={(o) => { if (!o) setEditAvailId(null); }}
          initial={{ day: availEdits[editingAvail.id]?.day ?? editingAvail.dayOfWeek, start: availEdits[editingAvail.id]?.start ?? editingAvail.startHour, end: availEdits[editingAvail.id]?.end ?? editingAvail.endHour }}
          onSave={(next) => { setAvailEdits((p) => ({ ...p, [editingAvail.id]: next })); setRemoveAvail((p) => { const n = new Set(p); n.delete(editingAvail.id); return n; }); setEditAvailId(null); }}
        />
      )}
      {editingBlock && (
        <EditDialog
          open title="Editar bloqueo" iconColor="text-blue-600"
          onOpenChange={(o) => { if (!o) setEditBlockId(null); }}
          initial={{
            title: blockEdits[editingBlock.id]?.title ?? editingBlock.title,
            day: blockEdits[editingBlock.id]?.day ?? editingBlock.dayOfWeek,
            start: blockEdits[editingBlock.id]?.start ?? editingBlock.startHour,
            end: blockEdits[editingBlock.id]?.end ?? editingBlock.endHour,
          }}
          showTitle
          onSave={(next) => { setBlockEdits((p) => ({ ...p, [editingBlock.id]: { title: next.title ?? "", ...next } })); setRemoveBlocks((p) => { const n = new Set(p); n.delete(editingBlock.id); return n; }); setEditBlockId(null); }}
        />
      )}
    </Dialog>
  );
}

/* ─── Sub-diálogo genérico de edición ─── */
function EditDialog({ open, onOpenChange, title: dlgTitle, iconColor, initial, showTitle, onSave }: {
  open: boolean; onOpenChange: (o: boolean) => void;
  title: string; iconColor: string;
  initial: { title?: string; day: number; start: number; end: number };
  showTitle?: boolean;
  onSave: (next: { title?: string; day: number; start: number; end: number }) => void;
}) {
  const [titleVal, setTitleVal] = useState(initial.title ?? "");
  const [day, setDay] = useState(String(initial.day));
  const [start, setStart] = useState(String(initial.start));
  const [end, setEnd] = useState(String(initial.end));
  const [err, setErr] = useState("");
  useEffect(() => {
    if (!open) return;
    setTitleVal(initial.title ?? ""); setDay(String(initial.day)); setStart(String(initial.start)); setEnd(String(initial.end)); setErr("");
  }, [open, initial.title, initial.day, initial.start, initial.end]);
  const startNum = Number(start);
  const endOptions = HOURS_END.filter((o) => Number(o.value) > startNum);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle className="flex items-center gap-2 text-base"><Pencil size={15} className={iconColor} /> {dlgTitle}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {showTitle && <div><Label>Motivo</Label><Input value={titleVal} onChange={(e) => setTitleVal(e.target.value)} placeholder="Ej: Reunión" /></div>}
          <div><Label>Día</Label><Select value={day} onValueChange={setDay}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{DAYS.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}</SelectContent></Select></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Inicio</Label><Select value={start || undefined} onValueChange={(v) => { setStart(v); setEnd((e) => endIfAfterStart(v, e)); }}><SelectTrigger><SelectValue placeholder="…" /></SelectTrigger><SelectContent>{SCHEDULE_HOURS_START.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Fin</Label><Select value={end || undefined} onValueChange={setEnd} disabled={!start}><SelectTrigger><SelectValue placeholder="…" /></SelectTrigger><SelectContent>{endOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select></div>
          </div>
          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}><X size={14} /> Cancelar</Button>
          <Button onClick={() => {
            if (showTitle && !titleVal.trim()) { setErr("El motivo es obligatorio"); return; }
            const d = Number(day), s = Number(start), e = Number(end);
            if (!(e > s)) { setErr("La hora de fin debe ser posterior"); return; }
            onSave({ ...(showTitle ? { title: titleVal.trim() } : {}), day: d, start: s, end: e });
          }}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
