# MEJORA UI-2 — Agenda Tutorías (continuación de SPEC-UI.md, YA implementada)

Ya existe: Modal, ConfirmDialog, Toast, WeekGrid, CrudList con lucide-react. NO lo rompas, reutilízalo todo.

## OBJETIVO 1 — Hub del profesor (vista centrada en un profesor)
Mejora /teachers/[id] como "hub del profesor" con pestañas (tabs locales, sin rutas nuevas si no quieres):
- **Pestaña Grupos:** cards/lista de SUS grupos (grupo, nº alumnos, nº franjas disponibles). Cada card → botones: abrir grupo (/groups/[id]) y "Horario disponible" (salta a la sección/pestaña de configuración de ese grupo).
- **Pestaña Alumnos:** TODOS los alumnos del profesor = unión de miembros de sus grupos + alumnos en teacher_students. Cada alumno: nombre, grupos en los que está (pills), prioridad por grupo, nº de peticiones de horario. Acción rápida: añadir alumno existente a teacher_students (dialog con selector).
- **Pestaña Horario:** su calendario semanal agregado (WeekGrid con TODOS los assignments de sus grupos, coloreado por grupo, click en bloque → dialog detalle + borrar).
- **Pestaña Disponibilidad:** selector de grupo (chips) + editor de franjas del grupo seleccionado (lista de availabilities de ese grupo con borrar + dialog añadir día/hora inicio/fin). Accesible directamente desde las cards de la pestaña Grupos vía estado (pestaña=Disponibilidad, grupo preseleccionado).
- Query param soportado: /teachers/[id]?tab=disponibilidad&group=2 abre esa pestaña con ese grupo (para los botones desde cards y desde el listado).

## OBJETIVO 2 — Dock inferior (móvil)
- Barra de navegación fija abajo SOLO en móvil (<768px): iconos grandes (44px+, lucide), 4 items: Inicio (Home), Profesores (Briefcase), Alumnos (GraduationCap), Grupos (Users). Item activo resaltado en color acento.
- `padding-bottom` suficiente en el main + safe-area-inset-bottom (env()). En desktop (>768px) se oculta y queda el header actual.
- aria-labels y aria-current en el item activo (usa usePathname para marcar activo; componentizar nav como client component).

## REQUISITOS
- Mobile-first: probado mentalmente a 375px de ancho; tabs scrollables horizontalmente si no caben.
- Sin dependencias nuevas prohibidas: ok lucide-react (ya está). NO shadcn/radix.
- `pnpm run build` debe pasar al final (ejecútalo tú). Rutas a verificar con curl (una vez tengas server temporal): /, /teachers, /teachers/1, /teachers/1?tab=disponibilidad, /students, /groups/1, /groups/1/horario, /api/teachers — todas 200. Mata tu server de verificación al terminar.
- Actualiza README.md. Imprime UI_OK + lista de archivos tocados.

## NOTAS DE ENTORNO
- pnpm único (npm está bloqueado por hardening). pnpm-workspace.yaml ya tiene onlyBuiltDependencies — no toques.
- Server: arranca si necesitas verificar (PORT=3001 npm start estilo pnpm exec next start -p 3001) y MÁTALO al final. Yo gestiono el :3000/producción.