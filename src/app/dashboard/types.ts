import type { TimeRange } from "@/lib/studentAvailability";
import { SCHEDULE_HOURS_START, SCHEDULE_HOURS_END } from "@/lib/hours";

export const COLORS = ["#2563eb", "#1d4ed8", "#0891b2", "#4f46e5", "#0284c7", "#7c3aed", "#0e7490", "#4338ca"];
export const HOURS_START = SCHEDULE_HOURS_START;
export const HOURS_END = SCHEDULE_HOURS_END;

export interface Teacher { id: number; name: string; email?: string | null; scheduleFixed?: boolean; }
export interface Subject {
  id: number; name: string; teacherId: number; defaultDurationMin: number;
  isCollective?: boolean; scheduleFixed?: boolean;
}
export interface TeacherBlock { id: number; teacherId: number; title: string; dayOfWeek: number; startHour: number; endHour: number; }
export interface Availability { id: number; teacherId: number; dayOfWeek: number; startHour: number; endHour: number; }
export interface Student {
  id: number;
  name: string;
  availableRanges?: TimeRange[];
  blockedRanges?: TimeRange[];
}
export interface SubjectStudent {
  subjectId: number;
  studentId: number;
  durationMin: number | null;
}
export interface Assignment {
  id: number; teacherId: number; subjectId: number; studentId: number;
  dayOfWeek: number; startHour: number; endHour: number; origin: string;
  collectiveSessionId?: string | null;
  student: { id: number; name: string };
  subject: { id: number; name: string; isCollective?: boolean };
}
