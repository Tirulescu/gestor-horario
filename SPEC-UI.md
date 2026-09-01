# MEJORA UI — Agenda Tutorías (proyecto existente en /root/projects/agenda)

Contexto: la app ya funciona (Next.js 15 + Drizzle + PG). Se pide ÚNICAMENTE mejorar la interfaz. No cambies la lógica de negocio ni los endpoints existentes (añadir endpoints nuevos está permitido si hace falta).

## OBJETIVOS

### 1. Botones con iconos
- Añade la dependencia `lucide-react` (usa pnpm, NO npm: pnpm es el gestor primario y hay un fix de onlyBuiltDependencies en pnpm-workspace.yaml — no lo toques).
- Todos los botones de acción llevan icono lucide: crear (Plus), editar (Pencil), borrar (Trash2), auto-agendar (Play o Sparkles), guardar (Save), cerrar (X), calendario (CalendarDays), grupos (Users), alumnos (GraduationCap), profes (Briefcase), horario (Clock), etc.
- Iconos del nav + logo simple en el header.

### 2. Dialogs (modales)
- Toda creación/edición de entidades (profesores, alumnos, grupos, miembros con prioridad, disponibilidades, allowances, peticiones de horario) en un **modal dialog**, no en páginas/secciones de formulario separadas.
- Usa el elemento nativo `<dialog>` con `showModal()` o un modal React mínimo propio. NO introduzcas shadcn/radix.
- Confirmación de borrado también en dialog ("¿Seguro que quieres borrar X?" + botones Cancelar/Borrar con rojo).
- Cierre con Escape y click en backdrop. Focus inicial en el primer campo.
- Toast/discreto feedback de éxito o error tras cada acción (puede ser un simple toast propio en esquina, sin dependencias).

### 3. Mobile-first / responsive
- Tables → targetas cards en pantallas <768px (oculta tabla en móvil o transforma con CSS; sin JS duplicado si es posible).
- Botones táctiles ≥44px de alto, inputs apilados a ancho completo en móvil.
- Nav usable en móvil (row con iconos, textos cortos okay).
- El calendario semanal puede hacer scroll horizontal en móvil.
- Verifica que `<meta name="viewport">` está en el layout.

### 4. Calendario del profesor
- Nueva página o pestaña `/teachers/[id]` (o mejora la existente): **horario semanal del profesor** agregando TODOS los assignments de TODOS sus grupos.
- Grid semanal Lunes-Domingo × horas (8:00-21:00), bloques coloreados por grupo, cada bloque muestra "grupo — alumno".
- Click en un bloque → dialog con detalles (grupo, alumno, día, hora, origen) y botón borrar esa asignación.
- Reutiliza el componente de grid semanal para esta vista y para la de grupo si puedes (componente compartido WeekGrid).
- Acceso desde el listado de profesores (botón con icono calendario) y desde el detalle de grupo ("Ver horario del profesor").

### 5. Estética general
- Minimalista refinado: fondo gris muy claro (#f8fafc), tarjetas blancas con sombra sutil y rounded-xl, UN color acento (azul #2563eb aprox), rojo solo para destructivo, verde solo para éxito.
- Hover states suaves, transiciones ~150ms, focus-visible rings, espacio en blanco generoso.
- Títulos claros, jerarquía visible, badges/pills para prioridades y estados.

## ENTREGA
- `pnpm run build` debe pasar. Ejecútalo tú y muestra el final.
- Verifica con curl las rutas: /, /teachers, /students, /groups, /groups/1, /teachers/1, /groups/1/horario y /api/teachers — todas 200.
- NO dejes ningún server arrancado (yo lo gestiono). Si tuviste que arrancar uno para verificar, mátalo al terminar.
- Actualiza README.md con lo nuevo (calendario del profesor, dialogs).
- Al final imprime la línea: UI_OK y lista de archivos modificados/creados.