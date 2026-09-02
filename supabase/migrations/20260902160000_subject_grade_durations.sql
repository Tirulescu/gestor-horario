-- Duración de una asignatura por curso (grade): regla persistente que se aplica al matricular alumnos.
CREATE TABLE IF NOT EXISTS subject_grade_durations (
  id serial PRIMARY KEY,
  subject_id integer NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  grade text NOT NULL,
  duration_min integer NOT NULL,
  slots_required integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subject_id, grade)
);

CREATE INDEX IF NOT EXISTS subject_grade_durations_subject_id_idx ON subject_grade_durations(subject_id);
