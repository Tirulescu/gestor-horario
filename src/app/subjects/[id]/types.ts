export interface Student {
  id: number;
  name: string;
  grade?: string | null;
}

export interface Subject {
  id: number;
  name: string;
  teacherId: number;
  defaultDurationMin: number;
  isCollective?: boolean;
  scheduleFixed?: boolean;
  teacher?: { name: string; scheduleFixed?: boolean };
}

export interface SubjectStudent {
  id: number;
  subjectId: number;
  studentId: number;
  durationMin: number | null;
  priority: number;
  slotsRequired: number;
  sessionParts?: number;
  student: Student;
}

export interface SlotRequest {
  id: number;
  studentId: number;
  subjectId: number;
  dayOfWeek: number;
  startHour: number;
  endHour: number;
  prefOrder: number;
  status: string;
}

export interface GradeDuration {
  id: number;
  subjectId: number;
  grade: string;
  durationMin: number;
  slotsRequired: number;
  sessionParts?: number;
}

export type ConfirmTarget =
  | { kind: "member"; id: number; label: string }
  | { kind: "gradeRule"; id: number; label: string }
  | null;
