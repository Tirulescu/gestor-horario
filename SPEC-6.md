# SPEC-6 — UI MÓVIL: hub del profesor usable, edición completa, sin accesos rápidos

Proyecto /root/projects/agenda. pnpm solo. La app funciona: NO rompas nada. shadcn + framer-motion ya instalados.

## APIs YA HECHAS por mí (ÚSALAS, no las dupliques):
- `PATCH /api/slot_requests` {id, dayOfWeek, startHour, endHour} — editar solicitud (parcial: solo lo que venga).
- `PATCH /api/availabilities` {id, dayOfWeek, startHour, endHour} — editar franja de disponibilidad.
- `PATCH /api/assignments` {id, dayOfWeek, startHour, endHour} — mover clase del horario.

## 1) ELIMINAR ACCESOS RÁPIDOS
- En TeacherScheduleClient.tsx (panel Resumen) BORRA la fila `<div className="flex flex-wrap gap-2">` con botones "Crear asignatura / Mi disponibilidad / Ver mis solicitudes". El Resumen queda: grid de 4 stats + card Próximas clases. Navegar = tabs.

## 2) HUB DEL PROFESOR EN MÓVIL (prioridad #1)
6 tabs (Resumen, Mis asignaturas, Mis solicitudes, Mi horario, Disponibilidad, Mis alumnos) NO caben en fila scrollable. Cambia TabsList del hub:
- En móvil (<768px): **grid 3 columnas × 2 filas**, cada trigger full-width, label centrado que pueda partir en 2 líneas, icono arriba (o solo icono+label pequeña). Sin scroll horizontal.
- En desktop: como está (fila).
- Implementación: CSS con clase propia (p.ej. `hub-tabs`) en globals.css usando media query, o className condicional en el componente tabs.tsx — como mejor encaje, pero el grid móvil es obligatorio.

## 3) TAMAÑOS TÁCTILES (mínimo 44px en móvil, todo)
- `.btn` y `.btn-sm`: en móvil min-height 44px, font-size ≥0.85rem, padding cómodo (globals.css ya tiene @media max-w 767 — amplíalo).
- `.btn-icon`: 44×44 en móvil.
- Inputs/Selects de todos los Dialogs: min-height 44px, font-size 16px (evita zoom iOS).
- TabsTrigger: ya 44px.
- Botones ▲▼ de prioridad/orden: mínimo 40×40, gap 8px.
- BottomNav dock: verifica items ≥48px de alto y labels legibles; ajusta si no.

## 4) DIALOGS EN MÓVIL
- DialogContent: en móvil que sea **bottom-sheet** (bottom-0, top auto, w-full, rounded-t-2xl, max-h 88dvh, entra deslizando desde abajo con framer-motion initial y:40) y en desktop sigue centrado. Añade safe-area (padding-bottom env(safe-area-inset-bottom)).
- Todo input dentro: Label encima (shadcn Label), Select con opciones 8:00–22:00 en horas exactas.
- Scroll interno cuando el contenido exceda, sin cortar botones.

## 5) EDICIÓN COMPLETA (lápices + dialogs)
- **Solicitudes** (/requests/RequestsClient.tsx y en el panel solicitudes del hub): por cada fila botón lápiz (Pencil) → Dialog "Editar solicitud": Select día, Select hora inicio, Select hora fin (precargados), guardar → PATCH /api/slot_requests; refresca lista. Botón ≥44px.
- **Disponibilidad** (hub, tabla franjas): lápiz por fila → Dialog igual → PATCH /api/availabilities.
- **Mi horario** (bloques del calendario): al pulsar un bloque se abre dialog de detalle (ya existe con selectedAssignment): añade ahí campos editables día/hora inicio/hora fin + botón Guardar → PATCH /api/assignments, y mantén el botón Eliminar. Nota: si re-auto-agenda se regenera todo (correcto).
- Todos los PUT/PATCH tras guardar: recarga datos.

## 6) SCROLL Y OVERFLOW MÓVIL
- Revisa cada página: sin overflow horizontal salvo weekgrid (que es intencional). `overflow-x-hidden` en main si hace falta.
- weekgrid en móvil: min-width quizá 560px basta; .block con padding 0.35rem y font 0.75rem.
- Cards de alumnos en solicitudes: apilados, acciones visibles sin hover.
- Header: el chip de profesor activo no debe empujar el nav; en móvil trunca nombre con ellipsis.

## VERIFICACIÓN (hazla tú y enseña salida)
1. `pnpm run build` ✓
2. Server :3001 temporal y curl 200 en /, /teachers/1, /requests, /subjects/1, /students, /api/teachers. Mata server.
3. NO toques schema ni seed.
4. Imprime SPEC6_OK + lista de archivos tocados.