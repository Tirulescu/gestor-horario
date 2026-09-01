# SPEC-4 — shadcn/ui + framer-motion + Solicitudes + Prioridad fácil

Proyecto existente /root/projects/agenda (Next.js 15 + Drizzle + PG + Tailwind 4 + lucide). Funciona; NO rompas nada. pnpm exclusivamente. NO tocar pnpm-workspace.yaml.

## Contexto técnico YA hecho (no repitas, parte de aquí)
- `slot_requests` tiene columna nueva `pref_order` (int, default 1) YA aplicada a la BD (drizzle-kit push hecho). Schema Drizzle ya actualizado.
- API slot_requests: POST acepta `prefOrder` (si no va, auto = última+1 del alumno+asignatura). PUT {id, dir:"up"|"down"} → swap de prefOrder con la vecina. DELETE ?id=. GET devuelve prefOrder.
- `src/lib/autoSchedule.ts` ya ordena las peticiones por prefOrder y las tareas por (priority profe, subjectOrder). NO cambiar esa lógica, solo consúmela (botón Auto-agendar).

## 1) shadcn/ui (estilo conocido, coherente con el minimalismo actual)
- Inicializa shadcn en el proyecto (`pnpm dlx shadcn@latest init`, estilo default/new-york el que mejor encaje, base color neutral/slate, CSS variables).
- Añade y USA al menos: Button, Card, Dialog, AlertDialog (confirmaciones), Input, Label, Select, Badge, Tabs, Table, Sonner o toast propio existente (mantén Toast.js si integra bien), Separator, ScrollArea (para el calendario móvil).
- Migra los flujos existentes a estos componentes: CRUD teachers/students/subjects, SubjectDetailClient (tabs, dialogs, tablas), TeacherScheduleClient, Modal→Dialog, ConfirmDialog→AlertDialog. Botones con lucide ya existentes: conserva iconos.
- NO introduzcas dark mode. Paleta actual minimalista (blanco/gris + azul 600) como tema.

## 2) framer-motion (animaciones sutiles, instalar `framer-motion`)
- pnpm add framer-motion (guárdalo como "motion" si el paquete pide el nuevo import "motion/react" — usa el que funcione con React 19/Next 15, client components).
- Anima: entrada de páginas/cards (fade+up leve, stagger corto), apertura/cierre de Dialog y AlertDialog (scale+fade, spring suave), Toasts (slide from corner), dock móvil (item activo con layoutId pill deslizante si es fácil), filas/elementos al reordenar prioridades (layout animation con framer-motion `layout` prop — que el intercambio se VEA).
- NADA estridente: 150-250ms, easing suave. Respetuoso con `prefers-reduced-motion`.

## 3) APARTADO NUEVO: "Solicitudes de horario"
- Ruta nueva `/requests` (nav header + dock: icono CalendarClock o Inbox, label "Solicitudes"). También accesible desde Asignaturas.
- `/requests`: listado por asignatura (selector/chips de asignaturas): para CADA alumno inscrito un card con:
  - Nombre alumno + badge de prioridad del profe (p1..pN) + contador entregadas/pedidas.
  - Sus posibilidades ORDENADAS por prefOrder, numeradas #1 #2 #3… cada una con botones ▲▼ (llaman PUT /api/slot_requests {id,dir}) con animación de layout al mover, día+hora legible ("Lun 16:00–17:00"), y botón borrar (AlertDialog).
  - Botón "Añadir solicitud" por alumno → Dialog shadcn: día (Select), hora inicio/fin (Input), validación contra disponibilidad del profesor (igual que existe en SubjectDetailClient: mostrar franjas válidas del día, bloquear si fuera).
- El formulario de posibilidad existente en SubjectDetailClient puede quedar; lo importante es este apartado unificado.

## 4) Prioridad entre alumnos = 1 clic
- En SubjectDetailClient (y en los cards de Solicitudes): sustituye el badge estático pN por un control inline: botones ▲ ▼ a los lados del badge que suben/bajan la prioridad de ese alumno ENTRE los de la asignatura (swap con el vecino en la lista ordenada; NO pedir número a mano).
- Implementación: endpoint nuevo PUT /api/subject_students {id, dir:"up"|"down"} que intercambia `priority` con el vecino (misma lógica de swap que slot_requests). Añádelo.
- Tras cada cambio, refresh y layout animation (framer-motion).

## 5) Seed
- Actualiza scripts/seed.ts para que las 33 posibilidades lleven prefOrder 1/2/3 correcto por alumno (la 1ª = la preferida).
- Re-ejecuta seed al final (pnpm seed) y deja la BD con el escenario Tamara. NO auto-agendes (eso lo disparo yo), solo deja datos listos.

## VERIFICACIÓN (hazla tú, muestra salida)
1. pnpm run build ✓ (pégalo).
2. Server temporal :3001: 
   - PUT /api/slot_requests {id:<una de Diego>, dir:"down"} → ok; GET reflejado; luego devuélvela ("up") para dejar el estado original.
   - PUT /api/subject_students {id:<miembro 2 de Instrumento>, dir:"up"} → priorities intercambiadas; devuelve dejándolas como estaban.
   - GET /api/slot_requests?subjectId=1 devuelve prefOrder en cada fila.
   - Rutas 200: /, /requests, /subjects, /subjects/1, /teachers/1, /students, /api/teachers.
   - MATa el server temporal al acabar.
3. Actualiza README.md (apartado Solicitudes, PUT reorder).
4. Imprime SPEC4_OK + lista de archivos tocados.