# SPEC-5 — APP PENSADA PARA EL PROFESOR (teacher-first)

Proyecto /root/projects/agenda tras SPEC-4 (shadcn/ui + framer-motion + /requests). Todo funciona; NO rompas. pnpm solo.

## Objetivo
La app la USAN PROFESORES. La navegación y las pantallas se reorganizan para que TODO el flujo diario del profesor esté a 1-2 clics desde SU hub.

## 1) Hub del profesor = centro de la app
- El nav principal (header + dock) pasa a ser: **Mi panel (/**), **Solicitudes** (/requests), **Alumnos** (/students), **Horarios** (/schedule). Los profesores se eligen en "Mi panel" (o /teachers mantiene el listado como selector de perfil).
- `/` (home) se convierte en "Mi panel": grid de PROFESORES como tarjetas seleccionables (elegir con quién entras). Al elegir un profesor → `/teachers/[id]` es SU panel personal con tabs: **Resumen** (hoy/próximas clases + accesos), **Asignaturas**, **Solicitudes** (las de sus asignaturas, filtradas), **Horario** (su calendario real), **Disponibilidad**, **Alumnos**.
- Deja claro SIEMPRE qué profesor está "activo": en el header, chip con avatar-iniciales y nombre del profe actual + menú/botón "cambiar profesor".
- Opcional si es barato: recordar el último profe activo en localStorage y que "Mi panel" lo ofrezca como "Continuar como X".

## 2) Flujos del profe, accesibles desde su hub
- Desde el hub: crear asignatura (dialog), editar SU disponibilidad (tab), ver solicitudes pendientes de sus asignaturas con contador, botón grande "Auto-agendar todo mi horario" con resultado (colocados/no colocados) en dialog.
- Las páginas de gestión (asignaturas, alumnos) muestran SIEMPRE el filtro/por-profesor cuando se entra desde un hub; el selector de profesor está arriba para cambiar de contexto.
- /requests: al elegir profesor en su hub, salta a /requests?teacherId=N ya filtrado.

## 3) Lenguaje y tono
- Copy centrado en el profe: "Mi horario", "Mis alumnos", "Mis asignaturas", "Mis solicitudes pendientes". Nada de jerga de admin.
- El profe NO toca conceptos técnicos: en la UI, "posibilidades" → "Solicitudes de horario del alumno"; "slots_required" → "Solicitudes pedidas"; "assignments" → "Clases".

## NOTAS
- No cambiesmodelo de datos ni endpoints salvo filtros ?teacherId que ya existen (añádelos donde falte: /api/requests agregado por asignatura puede ayudar: GET /api/subjects?teacherId=X ya existe).
- Mantén shadcn + framer-motion de SPEC-4 como sistema base.
- VERIFICA: pnpm run build ✓; server temporal :3001 y curl 200 en /, /teachers/1, /requests, /schedule (si existe), /teachers/1?tab=horario, /api/teachers; MATA el server. Actualiza README. Imprime SPEC5_OK + archivos tocados.