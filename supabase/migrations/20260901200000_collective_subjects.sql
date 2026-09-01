-- Asignaturas colectivas: una sesión compartida por varios alumnos
ALTER TABLE subjects ADD COLUMN IF NOT EXISTS is_collective boolean NOT NULL DEFAULT false;

-- Agrupa asignaciones que pertenecen a la misma sesión colectiva
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS collective_session_id text;

-- Fijar horario por asignatura (el auto-agendado no toca esa asignatura)
ALTER TABLE subjects ADD COLUMN IF NOT EXISTS schedule_fixed boolean NOT NULL DEFAULT false;
