-- Disponibilidad positiva del alumno (franjas donde puede asistir)
ALTER TABLE students ADD COLUMN IF NOT EXISTS available_ranges jsonb NOT NULL DEFAULT '[]'::jsonb;
