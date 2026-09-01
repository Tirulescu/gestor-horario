-- Eliminar modelo legacy de grupos (sustituido por asignaturas).

DROP POLICY IF EXISTS unit_allowances_teacher ON unit_allowances;
DROP POLICY IF EXISTS group_students_teacher ON group_students;
DROP POLICY IF EXISTS groups_teacher ON groups;

DROP TABLE IF EXISTS unit_allowances CASCADE;
DROP TABLE IF EXISTS group_students CASCADE;
DROP TABLE IF EXISTS groups CASCADE;

DROP POLICY IF EXISTS students_select_teacher ON students;

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
  );
