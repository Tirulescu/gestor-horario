"use client";

import { useState } from "react";
import { Lock, LockOpen } from "lucide-react";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/components/Toast";
import { useTeacherProfile } from "@/lib/useTeacherProfile";

export default function ScheduleLockToggle() {
  const toast = useToast();
  const { scheduleFixed, loading, saving, toggleScheduleFixed } = useTeacherProfile();
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (loading) return null;

  async function handleUnlock() {
    const ok = await toggleScheduleFixed(false);
    if (ok) toast("success", "Horario desbloqueado — ya puedes editar");
    else toast("error", "No se pudo desbloquear el horario");
  }

  async function handleConfirmLock() {
    const ok = await toggleScheduleFixed(true);
    setConfirmOpen(false);
    if (ok) toast("success", "Horario fijado");
    else toast("error", "No se pudo fijar el horario");
  }

  return (
    <>
      <button
        type="button"
        className={`schedule-lock-toggle ${scheduleFixed ? "schedule-lock-toggle-locked" : ""}`}
        aria-label={scheduleFixed ? "Horario fijado — pulsa para desbloquear" : "Horario editable — pulsa para fijar"}
        aria-pressed={scheduleFixed}
        title={scheduleFixed ? "Horario fijado" : "Horario editable"}
        disabled={saving}
        onClick={() => {
          if (scheduleFixed) void handleUnlock();
          else setConfirmOpen(true);
        }}
      >
        {scheduleFixed ? <Lock size={18} /> : <LockOpen size={18} />}
      </button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Fijar horario?</AlertDialogTitle>
            <AlertDialogDescription>
              Se bloqueará el auto-agendado y toda edición del plan (horarios, alumnos, asignaturas y preferencias horarias).
              Solo podrás consultar el detalle y ver las clases de hoy.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction loading={saving} onClick={(e) => { e.preventDefault(); void handleConfirmLock(); }}>
              Fijar horario
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
