-- teacher_students: solo lectura vía PostgREST; vínculos solo desde la app (DATABASE_URL).

DROP POLICY IF EXISTS teacher_students_teacher ON teacher_students;
DROP POLICY IF EXISTS teacher_students_select ON teacher_students;

CREATE POLICY teacher_students_select ON teacher_students
  FOR SELECT TO authenticated
  USING (teacher_id = current_teacher_id());
