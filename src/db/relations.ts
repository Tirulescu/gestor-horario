import { relations } from "drizzle-orm";
import {
  teachers, students, teacherStudents,
  subjects, subjectStudents, subjectGradeDurations, availabilities, slotRequests, assignments,
} from "./schema";

export const teachersRelations = relations(teachers, ({ many }) => ({
  teacherStudents: many(teacherStudents),
  subjects: many(subjects),
  availabilities: many(availabilities),
  assignments: many(assignments),
}));

export const studentsRelations = relations(students, ({ many }) => ({
  teacherStudents: many(teacherStudents),
  subjectStudents: many(subjectStudents),
  slotRequests: many(slotRequests),
  assignments: many(assignments),
}));

export const teacherStudentsRelations = relations(teacherStudents, ({ one }) => ({
  teacher: one(teachers, { fields: [teacherStudents.teacherId], references: [teachers.id] }),
  student: one(students, { fields: [teacherStudents.studentId], references: [students.id] }),
}));

export const subjectsRelations = relations(subjects, ({ one, many }) => ({
  teacher: one(teachers, { fields: [subjects.teacherId], references: [teachers.id] }),
  subjectStudents: many(subjectStudents),
  subjectGradeDurations: many(subjectGradeDurations),
  slotRequests: many(slotRequests),
  assignments: many(assignments),
}));

export const subjectGradeDurationsRelations = relations(subjectGradeDurations, ({ one }) => ({
  subject: one(subjects, { fields: [subjectGradeDurations.subjectId], references: [subjects.id] }),
}));

export const subjectStudentsRelations = relations(subjectStudents, ({ one }) => ({
  subject: one(subjects, { fields: [subjectStudents.subjectId], references: [subjects.id] }),
  student: one(students, { fields: [subjectStudents.studentId], references: [students.id] }),
}));

export const availabilitiesRelations = relations(availabilities, ({ one }) => ({
  teacher: one(teachers, { fields: [availabilities.teacherId], references: [teachers.id] }),
}));

export const slotRequestsRelations = relations(slotRequests, ({ one }) => ({
  student: one(students, { fields: [slotRequests.studentId], references: [students.id] }),
  subject: one(subjects, { fields: [slotRequests.subjectId], references: [subjects.id] }),
}));

export const assignmentsRelations = relations(assignments, ({ one }) => ({
  teacher: one(teachers, { fields: [assignments.teacherId], references: [teachers.id] }),
  subject: one(subjects, { fields: [assignments.subjectId], references: [subjects.id] }),
  student: one(students, { fields: [assignments.studentId], references: [students.id] }),
}));
