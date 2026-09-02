-- Partes de 30 min por defecto al inscribir alumnos de un curso en la asignatura.
alter table subject_grade_durations
  add column if not exists session_parts integer not null default 1;

alter table subject_grade_durations
  drop constraint if exists subject_grade_durations_session_parts_check;

alter table subject_grade_durations
  add constraint subject_grade_durations_session_parts_check
  check (session_parts >= 1 and session_parts <= 12);
