-- Endurece RLS: valida que el alumno pertenece al profesor antes de insertar
-- vínculos (subject_students, slot_requests, assignments) y añade RLS a
-- subject_grade_durations. Bloquea INSERT de students vía PostgREST.

CREATE OR REPLACE FUNCTION public.student_accessible_to_current_teacher(p_student_id integer)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    NOT EXISTS (
      SELECT 1 FROM teacher_students ts
      WHERE ts.student_id = p_student_id
        AND ts.teacher_id != current_teacher_id()
    )
    AND NOT EXISTS (
      SELECT 1 FROM subject_students ss
      JOIN subjects s ON s.id = ss.subject_id
      WHERE ss.student_id = p_student_id
        AND s.teacher_id != current_teacher_id()
    )
    AND (
      EXISTS (
        SELECT 1 FROM teacher_students ts
        WHERE ts.student_id = p_student_id
          AND ts.teacher_id = current_teacher_id()
      )
      OR EXISTS (
        SELECT 1 FROM subject_students ss
        JOIN subjects s ON s.id = ss.subject_id
        WHERE ss.student_id = p_student_id
          AND s.teacher_id = current_teacher_id()
      )
    );
$$;

REVOKE ALL ON FUNCTION public.student_accessible_to_current_teacher(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.student_accessible_to_current_teacher(integer) FROM anon;
REVOKE ALL ON FUNCTION public.student_accessible_to_current_teacher(integer) FROM authenticated;

-- ── subject_students ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS subject_students_teacher ON subject_students;

CREATE POLICY subject_students_teacher ON subject_students
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM subjects s
      WHERE s.id = subject_students.subject_id
        AND s.teacher_id = current_teacher_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM subjects s
      WHERE s.id = subject_students.subject_id
        AND s.teacher_id = current_teacher_id()
    )
    AND student_accessible_to_current_teacher(subject_students.student_id)
  );

-- ── slot_requests ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS slot_requests_teacher ON slot_requests;

CREATE POLICY slot_requests_teacher ON slot_requests
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM subjects s
      WHERE s.id = slot_requests.subject_id
        AND s.teacher_id = current_teacher_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM subjects s
      WHERE s.id = slot_requests.subject_id
        AND s.teacher_id = current_teacher_id()
    )
    AND student_accessible_to_current_teacher(slot_requests.student_id)
  );

-- ── assignments ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS assignments_teacher ON assignments;

CREATE POLICY assignments_teacher ON assignments
  FOR ALL TO authenticated
  USING (teacher_id = current_teacher_id())
  WITH CHECK (
    teacher_id = current_teacher_id()
    AND EXISTS (
      SELECT 1 FROM subjects s
      WHERE s.id = assignments.subject_id
        AND s.teacher_id = current_teacher_id()
    )
    AND student_accessible_to_current_teacher(assignments.student_id)
  );

-- ── subject_grade_durations ─────────────────────────────────────────────────
ALTER TABLE subject_grade_durations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS subject_grade_durations_teacher ON subject_grade_durations;

CREATE POLICY subject_grade_durations_teacher ON subject_grade_durations
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM subjects s
      WHERE s.id = subject_grade_durations.subject_id
        AND s.teacher_id = current_teacher_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM subjects s
      WHERE s.id = subject_grade_durations.subject_id
        AND s.teacher_id = current_teacher_id()
    )
  );

-- ── students: solo la app (DATABASE_URL) puede crear alumnos ────────────────
DROP POLICY IF EXISTS students_insert_authenticated ON students;
