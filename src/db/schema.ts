import { pgTable, serial, text, integer, real, boolean, jsonb, timestamp, primaryKey, pgEnum, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const originEnum = pgEnum("assignment_origin", ["manual", "auto"]);

export const teachers = pgTable("teachers", {
  id: serial("id").primaryKey(),
  authUserId: uuid("auth_user_id").unique(),
  name: text("name").notNull(),
  email: text("email"),
  scheduleFixed: boolean("schedule_fixed").notNull().default(false),
  hideWeekends: boolean("hide_weekends").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const students = pgTable("students", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email"),
  grade: text("grade"),
  blockedRanges: jsonb("blocked_ranges").notNull().default([]),
  /** Franjas en las que el alumno SÍ puede asistir (vacío = sin restricción positiva). */
  availableRanges: jsonb("available_ranges").notNull().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const teacherStudents = pgTable(
  "teacher_students",
  {
    teacherId: integer("teacher_id").notNull().references(() => teachers.id, { onDelete: "cascade" }),
    studentId: integer("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.teacherId, t.studentId] })]
);

// ---- subjects model ----
export const subjects = pgTable("subjects", {
  id: serial("id").primaryKey(),
  teacherId: integer("teacher_id").notNull().references(() => teachers.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  defaultDurationMin: integer("default_duration_min").notNull().default(60),
  /** Si true, todos los alumnos inscritos comparten una misma sesión horaria. */
  isCollective: boolean("is_collective").notNull().default(false),
  /** Si true, el auto-agendado no modifica las clases de esta asignatura. */
  scheduleFixed: boolean("schedule_fixed").notNull().default(false),
  /** Color hex (#RRGGBB) para el calendario; null = preset automático. */
  color: text("color"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Bloqueos manuales del profesor en su horario (otras clases, reuniones, comidas...)
export const teacherBlocks = pgTable("teacher_blocks", {
  id: serial("id").primaryKey(),
  teacherId: integer("teacher_id").notNull().references(() => teachers.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("Bloqueado"),
  dayOfWeek: integer("day_of_week").notNull(),
  startHour: real("start_hour").notNull(),
  endHour: real("end_hour").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const subjectStudents = pgTable(
  "subject_students",
  {
    id: serial("id").primaryKey(),
    subjectId: integer("subject_id").notNull().references(() => subjects.id, { onDelete: "cascade" }),
    studentId: integer("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
    durationMin: integer("duration_min"),
    priority: integer("priority").notNull().default(1),
    slotsRequired: integer("slots_required").notNull().default(1),
    /** Partes de 30 min que cubren la duración (1 = sesión única; N = N×30 = duración total). */
    sessionParts: integer("session_parts").notNull().default(1),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("subject_students_subject_student_uniq").on(t.subjectId, t.studentId)]
);

/** Duración de una asignatura para todos los alumnos de un curso (grade). */
export const subjectGradeDurations = pgTable(
  "subject_grade_durations",
  {
    id: serial("id").primaryKey(),
    subjectId: integer("subject_id").notNull().references(() => subjects.id, { onDelete: "cascade" }),
    grade: text("grade").notNull(),
    durationMin: integer("duration_min").notNull(),
    slotsRequired: integer("slots_required").notNull().default(1),
    /** Partes de 30 min que cubren la duración al inscribir (1 = sin dividir; N×30 = duración). */
    sessionParts: integer("session_parts").notNull().default(1),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("subject_grade_durations_subject_grade_uniq").on(t.subjectId, t.grade)]
);

export const availabilities = pgTable("availabilities", {
  id: serial("id").primaryKey(),
  teacherId: integer("teacher_id").notNull().references(() => teachers.id, { onDelete: "cascade" }),
  dayOfWeek: integer("day_of_week").notNull(),
  startHour: real("start_hour").notNull(),
  endHour: real("end_hour").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const slotRequests = pgTable("slot_requests", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  subjectId: integer("subject_id").notNull().references(() => subjects.id, { onDelete: "cascade" }),
  dayOfWeek: integer("day_of_week").notNull(),
  startHour: real("start_hour").notNull(),
  endHour: real("end_hour").notNull(),
  prefOrder: integer("pref_order").notNull().default(1),
  status: text("status").default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const assignments = pgTable("assignments", {
  id: serial("id").primaryKey(),
  teacherId: integer("teacher_id").notNull().references(() => teachers.id, { onDelete: "cascade" }),
  subjectId: integer("subject_id").notNull().references(() => subjects.id, { onDelete: "cascade" }),
  studentId: integer("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  dayOfWeek: integer("day_of_week").notNull(),
  startHour: real("start_hour").notNull(),
  endHour: real("end_hour").notNull(),
  origin: originEnum("origin").notNull().default("manual"),
  prefOrder: integer("pref_order"),
  /** Agrupa asignaciones de una misma sesión colectiva. */
  collectiveSessionId: text("collective_session_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});