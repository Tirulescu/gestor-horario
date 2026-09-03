import type { OccupancyKind, TimeRange } from "@/lib/studentAvailability";

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
export type ActionType = "block" | "event";
export type EventClassType = "subject" | "external";

export interface StudentScheduleManageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  students: Student[];
  grades: string[];
  subjects: SubjectOption[];
  subjectLinks: SubjectLink[];
  teacherBlocks?: OccupiedSlot[];
  assignments?: AssignmentRow[];
  initialStudentId?: number | null;
  saving?: boolean;
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

export type { OccupancyKind, TimeRange };
