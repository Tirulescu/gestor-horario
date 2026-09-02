"use client";

import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { DAYS } from "@/lib/validate";
import { fmtRange } from "@/lib/hours";
import type { Assignment, TeacherBlock } from "./types";

export interface ConfirmDeleteDialogsProps {
  confirmDeleteAsg: boolean;
  selectedAssignment: Assignment | null;
  selectedCollectiveSession: Assignment[] | null;
  confirmTb: TeacherBlock | null;
  deleting: boolean;
  onConfirmDeleteAsgOpenChange: (open: boolean) => void;
  onConfirmTbOpenChange: (open: boolean) => void;
  onDeleteAssignment: () => void;
  onDeleteTeacherBlock: () => void;
}

export default function ConfirmDeleteDialogs({
  confirmDeleteAsg,
  selectedAssignment,
  selectedCollectiveSession,
  confirmTb,
  deleting,
  onConfirmDeleteAsgOpenChange,
  onConfirmTbOpenChange,
  onDeleteAssignment,
  onDeleteTeacherBlock,
}: ConfirmDeleteDialogsProps) {
  return (
    <>
      <AlertDialog open={confirmDeleteAsg} onOpenChange={(o) => { if (!deleting) onConfirmDeleteAsgOpenChange(o); }}>
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
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              loading={deleting}
              onClick={(e) => {
                e.preventDefault();
                void onDeleteAssignment();
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmTb != null} onOpenChange={(o) => { if (!o && !deleting) onConfirmTbOpenChange(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Quitar evento</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmTb ? `¿Quitar el evento "${confirmTb.title}" del ${DAYS[confirmTb.dayOfWeek]} ${fmtRange(confirmTb.startHour, confirmTb.endHour)}?` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              loading={deleting}
              onClick={(e) => {
                e.preventDefault();
                void onDeleteTeacherBlock();
              }}
            >
              Quitar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
