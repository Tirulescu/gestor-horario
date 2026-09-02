import type { TimeRange } from "@/lib/studentAvailability";

export interface Student {
  id: number;
  name: string;
  email?: string | null;
  grade?: string | null;
  blockedRanges?: TimeRange[];
  availableRanges?: TimeRange[];
}

export interface SubjectOption {
  id: number;
  name: string;
  defaultDurationMin: number;
  isCollective?: boolean;
}

export interface SubjectLink {
  subjectId: number;
  studentId: number;
  durationMin?: number | null;
}

export interface OccupiedSlot {
  dayOfWeek: number;
  startHour: number;
  endHour: number;
  studentId?: number;
}

export interface AssignmentRow {
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

export type TargetMode = "student" | "grade" | "multiple";
export type ActionType = "availability" | "block" | "event";

export interface StudentScheduleManageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  students: Student[];
  grades: string[];
  subjects: SubjectOption[];
  subjectLinks: SubjectLink[];
  /** Eventos/reservas del profesor (no solapables con clases). */
  teacherBlocks?: OccupiedSlot[];
  /** Clases ya asignadas (profesor y alumnos). */
  assignments?: AssignmentRow[];
  initialStudentId?: number | null;
  saving?: boolean;
  onApplyAvailability: (args: {
    removes: { student: Student; ranges: TimeRange[] }[];
    targets: Student[];
    adds: TimeRange[];
  }) => Promise<boolean>;
  onApplyBlocks: (args: {
    removes: { student: Student; indices: number[] }[];
    targets: Student[];
    adds: TimeRange[];
  }) => Promise<boolean>;
  onApplyEvents: (args: {
    removeIds: number[];
    create?: {
      targets: Student[];
      subjectId: number;
      days: number[];
      start: number;
      endForStudent: (student: Student) => number;
    };
  }) => Promise<boolean>;
}
