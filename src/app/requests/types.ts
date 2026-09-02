import type { TimeRange } from "@/lib/studentAvailability";

export interface Subject {
  id: number; name: string; teacherId: number; defaultDurationMin: number; isCollective?: boolean;
  subjectStudents?: { id: number; durationMin: number | null }[];
  subjectGradeDurations?: { id: number; durationMin: number }[];
}
export interface SubjectStudent {
  id: number; subjectId: number; studentId: number;
  durationMin: number | null; priority: number; slotsRequired: number;
  student: { id: number; name: string };
}
export interface SlotRequest {
  id: number; studentId: number; subjectId: number;
  dayOfWeek: number; startHour: number; endHour: number;
  prefOrder: number; status: string;
}
export interface Availability { id: number; dayOfWeek: number; startHour: number; endHour: number; }
export interface Student { id: number; name: string; availableRanges?: TimeRange[]; blockedRanges?: TimeRange[]; }

export type ConfirmTarget =
  | { kind: "slot"; id: number; label: string }
  | null;
