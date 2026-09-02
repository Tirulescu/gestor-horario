-- Número de partes de 30 min en que se divide la clase del alumno en una asignatura.
-- 1 = sesión única (comportamiento actual); 2+ = varias medias horas no contiguas.
alter table subject_students
  add column if not exists session_parts integer not null default 1;

alter table subject_students
  drop constraint if exists subject_students_session_parts_check;

alter table subject_students
  add constraint subject_students_session_parts_check
  check (session_parts >= 1 and session_parts <= 12);
