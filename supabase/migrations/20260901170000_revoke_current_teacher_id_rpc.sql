-- La función solo la usan las políticas RLS internamente; no debe ser invocable vía PostgREST.
REVOKE ALL ON FUNCTION public.current_teacher_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_teacher_id() FROM anon;
REVOKE ALL ON FUNCTION public.current_teacher_id() FROM authenticated;
