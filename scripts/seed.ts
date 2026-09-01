import "dotenv/config";
import { db, schema } from "../src/db";
import { sql } from "drizzle-orm";

// Escenario: Profesora TAMARA — 11 alumnos — Asignatura "Instrumento" (1h, tarde)
// Disponibilidad: L 16-19 (3h) + M 16-20 (4h) + X 16-20 (4h) = 11h = 11 clases de 1h
// Cada alumno: prioridad única (1-11) y 3 posibilidades de horario.

async function main() {
  console.log("Limpiando BD (escenario Tamara)…");
  await db.execute(sql`TRUNCATE teachers, students, subjects, subject_students, availabilities, slot_requests, assignments, teacher_students RESTART IDENTITY CASCADE`);

  console.log("Insertando profesora Tamara…");
  const [tamara] = await db.insert(schema.teachers).values({ name: "Tamara", email: "tamara@ejemplo.com" }).returning();

  console.log("Insertando 11 alumnos (orden = prioridad)…");
  const names = [
    "Diego", "María", "Javier", "Lucía", "Carlos", "Elena",
    "Pablo", "Sofía", "Martín", "Valeria", "Hugo",
  ];
  const students = [] as { id: number; name: string }[];
  for (const name of names) {
    const [s] = await db.insert(schema.students).values({ name }).returning();
    students.push(s);
  }

  console.log("Insertando asignatura Instrumento (1h)…");
  const [instrumento] = await db.insert(schema.subjects).values({
    name: "Instrumento", teacherId: tamara.id, defaultDurationMin: 60,
  }).returning();

  console.log("Inscribiendo los 11 alumnos con prioridad 1-11 y 3 posibilidades pedidas…");
  await db.insert(schema.subjectStudents).values(
    students.map((s, i) => ({
      subjectId: instrumento.id,
      studentId: s.id,
      priority: i + 1,          // prioridad 1 = máxima … 11
      slotsRequired: 3,         // cada alumno entrega 3 posibilidades
      durationMin: null,        // usa la duración por defecto (60 min)
    })),
  );

  console.log("Insertando disponibilidad de Tamara (tarde): L 16-19, M 16-20, X 16-20…");
  await db.insert(schema.availabilities).values([
    { teacherId: tamara.id, dayOfWeek: 0, startHour: 16, endHour: 19 }, // Lunes 3h
    { teacherId: tamara.id, dayOfWeek: 1, startHour: 16, endHour: 20 }, // Martes 4h
    { teacherId: tamara.id, dayOfWeek: 2, startHour: 16, endHour: 20 }, // Miércoles 4h
  ]);

  console.log("Insertando 3 posibilidades por alumno (la 1ª = la que encaja si nadie molesta)…");
  // Días: 0=L 1=M 2=X. Ventanas dentro de la disponibilidad. Cada alumno incluye
  // su hueco "natural" primero; el scheduler elige por prioridad.
  // prefOrder: 1 = más preferida. Se asigna explícito (1,2,3) por alumno.
  const R = (studentIdx: number, rows: [number, number, number][]) =>
    rows.map(([d, a, b], i) => ({
      studentId: students[studentIdx].id,
      subjectId: instrumento.id,
      dayOfWeek: d,
      startHour: a,
      endHour: b,
      prefOrder: i + 1,
      status: "pending",
    }));

  await db.insert(schema.slotRequests).values([
    // prio 1 Diego → L16
    ...R(0, [[0, 16, 18], [1, 16, 18], [2, 16, 18]]),
    // prio 2 María → X16
    ...R(1, [[2, 16, 18], [0, 16, 18], [1, 17, 19]]),
    // prio 3 Javier → M16
    ...R(2, [[1, 16, 18], [0, 16, 18], [2, 16, 18]]),
    // prio 4 Lucía → X17
    ...R(3, [[2, 17, 19], [1, 17, 19], [0, 16, 18]]),
    // prio 5 Carlos → L17
    ...R(4, [[0, 17, 19], [1, 17, 19], [2, 16, 18]]),
    // prio 5=6 Elena → M17
    ...R(5, [[1, 17, 19], [0, 16, 18], [2, 17, 19]]),
    // prio 7 Pablo → X18
    ...R(6, [[2, 18, 20], [1, 18, 20], [0, 17, 19]]),
    // prio 8 Sofía → M18
    ...R(7, [[1, 18, 20], [2, 17, 19], [0, 17, 19]]),
    // prio 9 Martín → L18
    ...R(8, [[0, 18, 19], [2, 17, 19], [1, 16, 19]]),
    // prio 10 Valeria → M19
    ...R(9, [[1, 19, 20], [0, 16, 19], [2, 17, 20]]),
    // prio 11 Hugo → X19
    ...R(10, [[2, 19, 20], [1, 16, 20], [0, 16, 19]]),
  ]);

  console.log("Seed completado ✓ — Tamara + Instrumento + 11 alumnos (prioridades 1-11, 33 posibilidades con prefOrder 1/2/3, 11h de disponibilidad). Sin assignments: listo para Auto-agendar.");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });