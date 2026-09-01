# SPEC-3 — Modelo por ASIGNATURAS + pulido UI (proyecto /root/projects/agenda)

La app existe (Next.js 15 + Drizzle + PG). Esta spec CAMBIA el modelo de negocio y pule UI. Lee TODO antes de empezar. pnpm solo (npm bloqueado). NO toques pnpm-workspace.yaml.

## PARTE A — CAMBIO DE MODELO: ASIGNATURAS (reemplaza el concepto Grupo)

El horario lo crea un profesor PARA UNA ASIGNATURA sobre SU disponibilidad. Ejemplo real: asignatura "Instrumento" (1h por clase) asignada a Diego; le pido 3 posibilidades de horario en las horas que le indique; le asigno prioridad dentro de mi horario de disponibilidad.

### Esquema nuevo (Drizzle)
- `subjects`: id, teacher_id (NOT NULL), nombre ("Instrumento"), created_at. Una asignatura pertenece a UN profesor.
- `subject_students`: id, subject_id, student_id (UNIQUE par), duration_min (duración de la asignatura para ESE alumno; NULL = usar default de la asignatura), priority (int, 1 = máxima; prioridad de ese alumno para esa asignatura), created_at. Sustituye a group_students.
- `subjects` añade `default_duration_min` (int, ej 60). duration_min por alumno individualiza (1h, 30min, 2h...).
- `slot_requests` → añadir subject_id (NOT NULL, FK) además de student_id; son las "posibilidades" que da el alumno (día, hora inicio, hora fin). El profesor indica CUÁNTAS pide (nuevo campo `slots_required` int en subject_students, default 1) y en qué franjas (implícito: dentro de la disponibilidad del profesor).
- `availabilities`: se mantiene por (teacher_id, day, start, end) — la disponibilidad es DEL PROFESOR (su horario), compartida por todas sus asignaturas.
- `assignments`: añadir subject_id (NOT NULL) + mantener teacher_id, student_id, day, start, end, origen.
- `groups`/`group_students`: CONGELAR (no borrar tablas ni datos), pero fuera de la UI y de la API nueva. Rutas /groups/* pasan a ser stub que redirige a /subjects.
- Migración: como es dev, puedes recreatear limpio: `pnpm db:push --force` (o drop de las afectadas y push) + re-seed con datos de ejemplo de ASIGNATURAS (Ana: Instrumento 60min default (Diego prioridad 1, 3 posibilidades requeridas, María prioridad 2...), Lengua 30min; Luis: Inglés 60min).

### Auto-agendar por profesor (reescribe la lógica)
Función: dado teacher_id → construye SU horario completo con TODAS sus asignaturas de golpe:
1. Recolecta tasks = para cada asignatura del profe × cada alumno inscrito: duración efectiva (override o default).
2. Ordena por prioridad: primero prioridad 1 global, y DENTRO de la misma prioridad, por prioridad interna de la asignatura y luego por orden de asignatura. (La prioridad del alumno importa "interna y entre compañeros de asignatura".)
3. Para cada task, colócala en la disponibilidad del profesor sin solapar con nada ya colocado: PRIMERO prueba las slot_requests del alumno para esa asignatura (día/hora que pidió, si cae dentro de disponibilidad del profe y no solapa); si no caben, cualquier hueco libre de la disponibilidad.
4. Un alumno con `num_possibilities` (3 posibilidades pedidas) NO necesita 3 sesiones: necesita 1 asignación, elegida entre sus posibilidades. Las posibilidades son opciones, el profe/agenda elige la mejor.
5. Devuelve: assignments creados + lista de alumnos sin colocar (con motivo: sin hueco/sin disponibilidad).
Endpoint: POST /api/auto_schedule {teacherId} (reemplaza/cubre el de groupId; puede convivir). Elimina assignments previos del profee antes de regenerar (modo regenerar).

### API nueva/ajustada
- /api/subjects CRUD (con teacher_id), /api/subject_students (CRUD: alumno con duration_min, priority, slots_required), /api/teachers/:id/schedule (GET: assignments agregados con nombre asignatura, alumno, día, horas).
- Los existentes pueden seguir; actualiza el seed íntegro.

### UI dominio
- Sustituye "Grupos" por "Asignaturas" en TODO el flujo: nav del dock (Users→BookOpen, label Asignaturas), páginas /subjects, /subjects/[id].
- /subjects/[id]: cabecera (nombre, profe, duración por defecto), lista de alumnos de la asignatura con: duración efectiva (editable, dialog), prioridad, nº posibilidades pedidas (editable) y cuántas ha entregado (slot_requests contadas), añadir alumno (dialog selector), borrar.
- Posibilidades del alumno: en /students/[id] o dentro de la asignatura: listar/añadir posibilidades (día+hora ini+fin) — dialog.
- Hub del profesor /teachers/[id] tabs: **Asignaturas** (sus asignaturas: nombre, nº alumnos, duración base; acciones: abrir, disponibilidad), **Alumnos** (unión de alumnos de sus asignaturas: pills de asignaturas con prioridad y nº peticiones), **Horario** (calendario real, ver abajo), **Disponibilidad** (editor de franjas propias).
- Botón "Auto-agendar todo" en el hub del profesor (genera TODO su horario). Muestra resultado: colocados vs sin colocar.

### CALENDARIO REAL del profesor
- Vista semanal PRO de calidad: grid de columnas L-D, filas por horas (8:00–21:00), líneas de hora, ahora (opcional si easy), bloques posicionados por CSS absolute/height proporcional a duración REAL (un bloque de 90min ocupa 1.5 filas), NO solo celdas redondeadas por hora.
- Cada bloque: **nombre de la ASIGNATURA + alumno** ("Instrumento — Diego"), color por asignatura (paleta fija de 8 colores suaves consistente entre vistas).
- Solapes (no deberían existir tras auto-agendar): side-by-side.
- Reutilizable en grupo→asignatura (solo esa asignatura) y hub profe (todas).
- Fondo de la zona fuera de disponibilidad del profe levemente sombreada (opcional).

## PARTE B — PULIDO UI (independiente del modelo)

### 1. Dialogs SIEMPRE centrados
- Audita Modal/ConfirmDialog: centro absoluto de viewport (fixed inset-0 grid place-items-center; el propio <dialog> con margin:auto / centered). Nada desplazado arriba. En móvil: max-height 85dvh, scroll interno, ancho min(92vw, 480px). Backdrop blur sutil.

### 2. Dock flotante (estilo premium)
- Deja de ser barra pegada full-width: pastilla flotante `fixed bottom-[calc(16px+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2`, fondo blanco/blur, rounded-2xl, shadow-xl suave, padding lateral, items con icono+label, activo = pill acento (fondo azul suave + texto azul). Solo móvil (lg:hidden). Ajusta padding-bottom del main para no tapar contenido.

### 3. Consistencia
- Mismos toasts/tipografía/radios en páginas nuevas = ya existentes. Nada de romper CrudList/WeekGrid salvo donde se pide.

## VERIFICACIÓN (hazla TÚ, mustra resultados)
1. `pnpm db:push --force` + `pnpm seed` sin errores.
2. `pnpm run build` ✓ (pégalo).
3. Server temporal :3001: POST /api/auto_schedule {teacherId:1} → devuelve assignments con subjectId/subjectName/studentName; GET /api/teachers/1/schedule → lista con asignatura; rutas /, /subjects, /subjects/1, /teachers/1, /teachers/1?tab=horario, /students, /api/teachers → 200.
4. MATLAB el server temporal al terminar. NO arrancar nada en :3000.
5. Imprime: SPEC3_OK + lista de archivos tocados.