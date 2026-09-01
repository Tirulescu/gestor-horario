-- Aislamiento por profesor: cada usuario autenticado solo accede a sus datos.
-- Nota: la app Next.js usa DATABASE_URL (rol postgres) y no pasa por estas políticas;
-- la autorización principal está en src/lib/auth/requireTeacher.ts.
-- Estas políticas protegen el acceso directo vía PostgREST / Supabase client.

CREATE OR REPLACE FUNCTION public.current_teacher_id()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM teachers WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

-- ── teachers ──────────────────────────────────────────────────────────────
ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;

CREATE POLICY teachers_select_own ON teachers
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());

CREATE POLICY teachers_update_own ON teachers
  FOR UPDATE TO authenticated
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

CREATE POLICY teachers_insert_own ON teachers
  FOR INSERT TO authenticated
  WITH CHECK (auth_user_id = auth.uid());

-- ── subjects, availabilities, assignments, teacher_blocks, groups ─────────
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE availabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY subjects_teacher ON subjects
  FOR ALL TO authenticated
  USING (teacher_id = current_teacher_id())
  WITH CHECK (teacher_id = current_teacher_id());

CREATE POLICY availabilities_teacher ON availabilities
  FOR ALL TO authenticated
  USING (teacher_id = current_teacher_id())
  WITH CHECK (teacher_id = current_teacher_id());

CREATE POLICY assignments_teacher ON assignments
  FOR ALL TO authenticated
  USING (teacher_id = current_teacher_id())
  WITH CHECK (teacher_id = current_teacher_id());

CREATE POLICY teacher_blocks_teacher ON teacher_blocks
  FOR ALL TO authenticated
  USING (teacher_id = current_teacher_id())
  WITH CHECK (teacher_id = current_teacher_id());

CREATE POLICY groups_teacher ON groups
  FOR ALL TO authenticated
  USING (teacher_id = current_teacher_id())
  WITH CHECK (teacher_id = current_teacher_id());

-- ── teacher_students ──────────────────────────────────────────────────────
ALTER TABLE teacher_students ENABLE ROW LEVEL SECURITY;

CREATE POLICY teacher_students_teacher ON teacher_students
  FOR ALL TO authenticated
  USING (teacher_id = current_teacher_id())
  WITH CHECK (teacher_id = current_teacher_id());

-- ── subject_students (vía asignatura del profesor) ────────────────────────
ALTER TABLE subject_students ENABLE ROW LEVEL SECURITY;

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
  );

-- ── slot_requests (vía asignatura del profesor) ───────────────────────────
ALTER TABLE slot_requests ENABLE ROW LEVEL SECURITY;

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
  );

-- ── group_students (vía grupo del profesor) ───────────────────────────────
ALTER TABLE group_students ENABLE ROW LEVEL SECURITY;

CREATE POLICY group_students_teacher ON group_students
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM groups g
      WHERE g.id = group_students.group_id
        AND g.teacher_id = current_teacher_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM groups g
      WHERE g.id = group_students.group_id
        AND g.teacher_id = current_teacher_id()
    )
  );

-- ── unit_allowances (vía grupo del profesor) ──────────────────────────────
ALTER TABLE unit_allowances ENABLE ROW LEVEL SECURITY;

CREATE POLICY unit_allowances_teacher ON unit_allowances
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM groups g
      WHERE g.id = unit_allowances.group_id
        AND g.teacher_id = current_teacher_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM groups g
      WHERE g.id = unit_allowances.group_id
        AND g.teacher_id = current_teacher_id()
    )
  );

-- ── students (acceso indirecto por vínculos del profesor) ─────────────────
ALTER TABLE students ENABLE ROW LEVEL SECURITY;

CREATE POLICY students_select_teacher ON students
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM subject_students ss
      JOIN subjects s ON s.id = ss.subject_id
      WHERE ss.student_id = students.id
        AND s.teacher_id = current_teacher_id()
    )
    OR EXISTS (
      SELECT 1 FROM teacher_students ts
      WHERE ts.student_id = students.id
        AND ts.teacher_id = current_teacher_id()
    )
    OR EXISTS (
      SELECT 1 FROM group_students gs
      JOIN groups g ON g.id = gs.group_id
      WHERE gs.student_id = students.id
        AND g.teacher_id = current_teacher_id()
    )
  );

CREATE POLICY students_insert_authenticated ON students
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY students_update_teacher ON students
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM teacher_students ts
      WHERE ts.student_id = students.id
        AND ts.teacher_id = current_teacher_id()
    )
    OR EXISTS (
      SELECT 1 FROM subject_students ss
      JOIN subjects s ON s.id = ss.subject_id
      WHERE ss.student_id = students.id
        AND s.teacher_id = current_teacher_id()
    )
  );

CREATE POLICY students_delete_teacher ON students
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM teacher_students ts
      WHERE ts.student_id = students.id
        AND ts.teacher_id = current_teacher_id()
    )
  );
