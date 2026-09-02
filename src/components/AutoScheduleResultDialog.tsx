"use client";

import { useMemo } from "react";
import { CheckCircle2, Sparkles, Users, XCircle, Clock, CalendarDays } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DAYS } from "@/lib/validate";
import { fmtRange } from "@/lib/hours";
import type {
  AutoScheduleAssigned,
  AutoScheduleResult,
} from "@/lib/autoScheduleTypes";

export type { AutoScheduleResult } from "@/lib/autoScheduleTypes";

function prefLabel(prefOrder: number | null | undefined): { label: string; variant: "success" | "warn" | "gray" } {
  if (prefOrder == null) return { label: "Sin peticiones", variant: "gray" };
  if (prefOrder === 0) return { label: "Por disponibilidad", variant: "warn" };
  return { label: `Opción #${prefOrder}`, variant: "success" };
}

interface DisplayRow {
  key: string;
  subjectId: number;
  subjectName: string;
  studentLabel: string;
  studentCount: number;
  day: number;
  startHour: number;
  endHour: number;
  prefOrder: number | null | undefined;
  isCollective: boolean;
}

function buildDisplayRows(assigned: AutoScheduleAssigned[]): DisplayRow[] {
  const rows: DisplayRow[] = [];
  const collectiveSeen = new Set<string>();

  for (const a of assigned) {
    if (a.isCollective && a.collectiveSessionId) {
      if (collectiveSeen.has(a.collectiveSessionId)) continue;
      collectiveSeen.add(a.collectiveSessionId);
      const group = assigned.filter((x) => x.collectiveSessionId === a.collectiveSessionId);
      rows.push({
        key: a.collectiveSessionId,
        subjectId: a.subjectId,
        subjectName: a.subjectName,
        studentLabel: group.map((g) => g.studentName).join(", "),
        studentCount: group.length,
        day: a.day,
        startHour: a.startHour,
        endHour: a.endHour,
        prefOrder: null,
        isCollective: true,
      });
    } else if (!a.isCollective) {
      rows.push({
        key: `${a.studentId}-${a.subjectId}-${a.day}-${a.startHour}`,
        subjectId: a.subjectId,
        subjectName: a.subjectName,
        studentLabel: a.studentName,
        studentCount: 1,
        day: a.day,
        startHour: a.startHour,
        endHour: a.endHour,
        prefOrder: a.prefOrder,
        isCollective: false,
      });
    }
  }

  return rows;
}

interface AutoScheduleResultDialogProps {
  result: AutoScheduleResult | null;
  onClose: () => void;
  subjectColors?: Record<number, string>;
  mode?: "preview" | "applied";
  onApply?: () => void;
  applying?: boolean;
}

function SummaryStat({
  value,
  label,
  tone,
}: {
  value: string | number;
  label: string;
  tone: "green" | "red" | "blue";
}) {
  const tones = {
    green: "bg-green-50 border-green-100 text-green-800",
    red: "bg-red-50 border-red-100 text-red-800",
    blue: "bg-blue-50 border-blue-100 text-blue-800",
  };
  const labelTones = {
    green: "text-green-700",
    red: "text-red-700",
    blue: "text-blue-700",
  };

  return (
    <div className={`rounded-xl border px-2.5 py-2 sm:px-4 sm:py-3 text-center sm:text-left ${tones[tone]}`}>
      <div className="text-base sm:text-xl font-bold tabular-nums leading-none">{value}</div>
      <p className={`text-[10px] sm:text-xs font-medium mt-1 leading-tight ${labelTones[tone]}`}>{label}</p>
    </div>
  );
}

function SessionRow({
  row,
  subjectColors,
  compact = false,
}: {
  row: DisplayRow;
  subjectColors: Record<number, string>;
  compact?: boolean;
}) {
  const color = subjectColors[row.subjectId] ?? "#2563eb";
  const pref = prefLabel(row.prefOrder);

  if (compact) {
    return (
      <div className="rounded-xl border border-gray-100 bg-white px-3 py-3 space-y-2">
        <div className="flex items-start gap-2.5 min-w-0">
          <span className="mt-1 h-8 w-1 rounded-full shrink-0" style={{ background: color }} />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-semibold text-gray-900 text-sm">{row.subjectName}</span>
              {row.isCollective ? (
                <Badge variant="success" className="gap-1">
                  <Users size={11} /> Colectiva
                </Badge>
              ) : (
                <Badge variant={pref.variant}>{pref.label}</Badge>
              )}
            </div>
            <p className="text-sm text-gray-700 line-clamp-2" title={row.studentLabel}>
              {row.isCollective ? `${row.studentCount} alumnos: ` : ""}
              {row.studentLabel}
            </p>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
              <span className="inline-flex items-center gap-1">
                <CalendarDays size={12} /> {DAYS[row.day]}
              </span>
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Clock size={12} /> {fmtRange(row.startHour, row.endHour)}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <tr className="border-b border-gray-100 last:border-0 hover:bg-gray-50/80">
      <td className="py-2.5 pl-3 pr-2 align-top">
        <div className="flex items-center gap-2 min-w-0">
          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: color }} />
          <span className="font-medium text-gray-900 truncate">{row.subjectName}</span>
        </div>
      </td>
      <td className="py-2.5 px-2 align-top text-sm text-gray-700 max-w-[14rem]">
        <span className="line-clamp-2" title={row.studentLabel}>
          {row.isCollective ? (
            <span className="inline-flex items-center gap-1">
              <Users size={12} className="text-green-600 shrink-0" />
              {row.studentCount} alumnos
            </span>
          ) : (
            row.studentLabel
          )}
        </span>
      </td>
      <td className="py-2.5 px-2 align-top text-sm text-gray-600 whitespace-nowrap">{DAYS[row.day]}</td>
      <td className="py-2.5 px-2 align-top text-sm text-gray-600 tabular-nums whitespace-nowrap">
        {fmtRange(row.startHour, row.endHour)}
      </td>
      <td className="py-2.5 pl-2 pr-3 align-top">
        {row.isCollective ? (
          <Badge variant="success" className="gap-1">
            <Users size={11} /> Colectiva
          </Badge>
        ) : (
          <Badge variant={pref.variant}>{pref.label}</Badge>
        )}
      </td>
    </tr>
  );
}

export default function AutoScheduleResultDialog({
  result,
  onClose,
  subjectColors = {},
  mode = "applied",
  onApply,
  applying = false,
}: AutoScheduleResultDialogProps) {
  const open = result !== null;
  const isPreview = mode === "preview" || Boolean(result?.simulated);
  const assigned = result?.assigned ?? [];
  const unassigned = result?.unassigned ?? [];
  const skipped = result?.skipped ?? [];
  const displayRows = useMemo(() => buildDisplayRows(assigned), [assigned]);
  const placedCount = displayRows.length;
  const failedCount = unassigned.length;
  const totalTasks = placedCount + failedCount;
  const successRate = totalTasks > 0 ? Math.round((placedCount / totalTasks) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent size="lg" className="flex max-h-[min(90dvh,720px)] flex-col gap-0 overflow-hidden p-0">
        <div className="shrink-0 px-5 pt-5 pb-4">
          <DialogHeader className="mb-0">
            <DialogTitle className="flex items-start gap-2.5 pr-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 text-blue-700 shrink-0">
                <Sparkles size={17} />
              </span>
              <span className="leading-snug pt-1">
                {isPreview ? "Resultado del auto-agendado" : "Horario aplicado"}
              </span>
            </DialogTitle>
            <DialogDescription>
              {isPreview
                ? "Revisa las clases propuestas. Si te encaja, aplícalas a tu horario."
                : placedCount > 0
                  ? `${placedCount} colocada${placedCount !== 1 ? "s" : ""} en tu horario.`
                  : failedCount > 0
                    ? "Ninguna clase colocada."
                    : "Nada pendiente."}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="min-h-0 space-y-5 overflow-y-auto overscroll-contain px-5 pb-5">
          <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
            <SummaryStat value={placedCount} label="Colocadas" tone="green" />
            <SummaryStat value={failedCount} label="Sin colocar" tone="red" />
            <SummaryStat value={`${successRate}%`} label="Éxito" tone="blue" />
          </div>

          {displayRows.length > 0 && (
            <section className="space-y-2.5">
              <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                <CheckCircle2 size={15} className="text-green-600 shrink-0" />
                Clases colocadas
              </h3>

              <div className="sm:hidden space-y-2">
                {displayRows.map((row) => (
                  <SessionRow key={row.key} row={row} subjectColors={subjectColors} compact />
                ))}
              </div>

              <div className="hidden sm:block rounded-xl border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[34rem] text-left">
                    <thead>
                      <tr className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                        <th className="py-2 pl-3 pr-2">Asignatura</th>
                        <th className="py-2 px-2">Alumno(s)</th>
                        <th className="py-2 px-2">Día</th>
                        <th className="py-2 px-2">Horario</th>
                        <th className="py-2 pl-2 pr-3">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayRows.map((row) => (
                        <SessionRow key={row.key} row={row} subjectColors={subjectColors} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}

          {unassigned.length > 0 && (
            <section className="space-y-2.5">
              <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                <XCircle size={15} className="text-red-600 shrink-0" />
                Sin colocar ({unassigned.length})
              </h3>
              <div className="rounded-xl border border-red-100 overflow-hidden divide-y divide-red-100">
                {unassigned.map((u, i) => (
                  <div key={i} className="bg-red-50/40 px-3 py-2.5 sm:px-4">
                    <div className="font-medium text-gray-900 text-sm">
                      {u.subjectName}
                      <span className="text-gray-400 mx-1.5">·</span>
                      {u.studentName}
                    </div>
                    <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">{u.reason}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {skipped.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-800">Omitidas (horario fijado)</h3>
              <div className="rounded-xl border border-amber-100 overflow-hidden divide-y divide-amber-100">
                {skipped.map((s) => (
                  <p key={s.subjectId} className="text-sm text-gray-600 bg-amber-50/60 px-3 py-2.5 sm:px-4">
                    <span className="font-medium text-gray-800">{s.subjectName}</span>
                    <span className="text-gray-400 mx-1.5">·</span>
                    {s.reason}
                  </p>
                ))}
              </div>
            </section>
          )}
        </div>

        {isPreview && onApply && (
          <DialogFooter className="shrink-0 border-t border-gray-100 px-5 py-4">
            <Button variant="outline" type="button" onClick={onClose} disabled={applying}>
              Cancelar
            </Button>
            <Button type="button" loading={applying} onClick={onApply}>
              Aplicar al horario
            </Button>
          </DialogFooter>
        )}

        {!isPreview && (
          <DialogFooter className="shrink-0 border-t border-gray-100 px-5 py-4">
            <Button type="button" onClick={onClose}>
              Cerrar
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
