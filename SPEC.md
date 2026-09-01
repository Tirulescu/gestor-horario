# PROYECTO: Agenda Inteligente de Tutorías

> **Nota:** Este documento es la especificación original del MVP local. La app actual usa **Supabase** (Auth + PostgreSQL remoto). Ver `README.md` para instrucciones actuales.

Web app Next.js para agendar clases/tutorías automáticamente entre profesores, grupos de alumnos y alumnos.

## STACK (obligatorio)
- Next.js 15 (App Router) + TypeScript
- Drizzle ORM + PostgreSQL local
- Tailwind CSS (v4). UI: colores simples, blanco/gris + UN color de acento (azul), tipografía limpia, mucho espacio en blanco, tarjetas con bordes redondeados, estilo minimalista
- Node 26, npm 11

## UBICACIÓN
Trabaja en /root/projects/agenda (cwd actual). Ya existe git init.

## DB (Supabase — ver README.md)

La base de datos corre en Supabase PostgreSQL. Variables en `.env.example`.

## MODELO DE NEGOCIO (léelo con cuidado)
- Profesores, Alumnos y Grupos con CRUD completo (crear, listar, editar, borrar).
- Cada GRUPO pertenece a EXACTAMENTE UN profesor (groups.teacher_id, NOT NULL).
- Un profesor puede tener muchos alumnos asignados (teacher_students: relación directa profe→alumno).
- Un alumno puede estar en VARIOS grupos (group_students, M:N).
- El profesor HABILITA horarios disponibles a un grupo: la entidad Availability pertenece a (teacher_id, group_id, día de la semana 0-6, hora_inicio, hora_fin). Un profesor define disponibilidades POR GRUPO. Pueden ser franjas semanales recurrentes (día+hora) — no hace falta fecha concreta.
- Cada profesor pone a cada alumno una PRIORIDAD de elección (entero 1 = máxima prioridad, o el que tú decidas, pero documenta). Prioridad se define POR GRUPO (priority dentro de group_students, editable por el profesor).
- Cada alumno puede proponer VARIAS posibilidades de horario (slot_requests: slot_request.id → student_id, group_id, día 0-6, hora_inicio, hora_fin, estado opcional).
- El profe define CUÁNTAS UNIDADES DE TIEMPO puede pedir/se le asignan a cada alumno: "este alumno debe poner 1 posibilidad de media hora, otras de 2 horas" → unit_allowances: student_id (o NULL), group_id, duración_minutos (30, 60, 120), cantidad (X). Si student_id es NULL aplica a TODO EL GRUPO (las específicas del alumno anulan la del grupo). Cada allowance es una fila (student_id NULL = todo el grupo).
- El horario lo pone el profesor a cada alumno: assignments: student_id, group_id, día, hora_inicio, hora_fin, origen ('manual' | 'auto'), created_at.
- AUTO-AGENDAR: función que, dado un grupo, recorre alumnos ordenados por prioridad, y para cada uno coloca sus unidades de tiempo (según allowances) dentro de las Availability del grupo, respetando los slot_requests del alumno como preferencia y la disponibilidad del profesor, sin solaparse con assignments existentes (ni de otros grupos del mismo profesor). Es greedy, sin exigir optimalidad. Debe ser invocable desde un botón en la UI del grupo y devolver el resumen (asignados, sin hueco).

## REQUISITOS FUNCIONALES
1. CRUD completo REST (route handlers bajo /api/…): teachers, students, groups, group_students(members+priority), availabilities, slot_requests, unit_allowances, assignments. DELETE de padre en cascada coherente.
2. Seed automático en arranque (o script npm run seed) con: 1 profesor "Ana García", otro "Luis Pérez"; 6 alumnos con nombres españoles; 3 grupos (Matemáticas/Ana, Lengua/Ana, Inglés/Luis); memberships con prioridades; availabilities variadas; allowances (mezcla por-alumno y por-grupo); slot_requests de ejemplo; sin assignments iniciales (para poder probar Auto-agendar).
3. UI (App Router, server components + client components pequeños):
   - Página home: resumen (nº profes, alumnos, grupos) + accesos.
   - /teachers, /students, /groups: listado + formulario crear/editar/borrar minimalista.
   - /groups/[id]: detalle del grupo: alumnos miembros con prioridad editable, tabla de disponibilidades del grupo añadir/quitar, allowances (por grupo y por alumno), lista de alumnos con sus slot_requests y añadir, botón "Auto-agendar" + resultado.
   - /groups/[id]/horario: vista semanal (grid días x horas) mostrando assignments del grupo, coloreadas por alumno.
   - Validaciones básicas (hora_inicio < hora_fin, FKs válidas) con mensajes claros en la UI.
4. Toda operación de escritura vía API routes (fetch desde client components o server actions — tú eliges, coherente).

## ENTREGA
- Proyecto funcional completo, `npm run build` debe pasar sin errores.
- Migraciones drizzle aplicadas (drizzle-kit push) y seed ejecutado.
- Deja un archivo README.md breve con: cómo arrancar, modelo de datos, endpoints.
- Al terminar ejecuta tú mismo: `npm run build` y arranca el servidor una vez (`PORT=3001 npm start` o dev) y haz curl de verificación a /, /api/teachers — muestra resultados y DEJA el build OK.
- NO dejes el servidor arrancado (yo lo arranco después).
- Al final imprime: BUILD_OK y la lista de archivos principales.