# Gestor de horario

Web app (Next.js 15 + App Router + TypeScript) para agendar clases/tutorías automáticamente, con algoritmo de **auto-agendar** greedy.

Cada usuario se autentica con **Google (Supabase Auth)**. Su cuenta es el profesor: no hay selector ni varios perfiles.

## Stack

- Next.js 15 (App Router) + TypeScript
- Supabase Auth (Google OAuth) + PostgreSQL (Supabase)
- Drizzle ORM (API routes server-side)
- Tailwind CSS v4 + shadcn/ui
- pnpm

## Cómo arrancar

```bash
# 1. Copiar variables de entorno
cp .env.example .env
# Rellenar NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, DATABASE_URL

# 2. Aplicar esquema a la BD (Supabase)
pnpm run db:push

# 3. (Opcional) Sembrar datos de ejemplo
pnpm run seed

# 4. Desarrollo
pnpm dev
```

### Supabase

1. Crear proyecto en [supabase.com](https://supabase.com)
2. **Authentication → Providers → Google**: activar y pegar `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
3. **Project Settings → Database**: copiar la connection string (Session pooler, puerto 6543) a `DATABASE_URL`
4. **API**: copiar URL y publishable key a las variables `NEXT_PUBLIC_*`
5. Aplicar la migración RLS: `supabase/migrations/20260901120000_teacher_isolation_rls.sql` (vía SQL Editor o CLI)

La app Next.js usa `DATABASE_URL` (rol postgres) en las API routes; la autorización está en `src/lib/auth/requireTeacher.ts`. Las políticas RLS protegen el acceso directo vía PostgREST.

## Modelo de datos

- **teachers** — Perfil del usuario autenticado (`auth_user_id` → Supabase Auth, 1:1)
- **students** — Alumnos
- **subjects** — Asignaturas del profesor
- **teacher_students**, **subject_students** — Relaciones M:N
- **availabilities** — Franjas semanales recurrentes del profesor
- **teacher_blocks** — Bloques personales (reservas)
- **slot_requests** — Peticiones de horario de alumnos
- **assignments** — Horario definitivo (`origin`: manual | auto)

## UI principal

- `/` → redirige a `/dashboard`
- `/dashboard` — Panel del profesor (pestañas: horario, alumnos, asignaturas, disponibilidad)
- `/students` — CRUD alumnos
- `/subjects` — CRUD asignaturas
- `/requests` — Solicitudes de horario
- `/profile` — Perfil (nombre editable)
- `/login` — Inicio de sesión con Google

Rutas legacy `/teachers` y `/teachers/[id]` redirigen a `/dashboard`.

## Endpoints API

Todas las rutas bajo `/api/*` requieren sesión Supabase. El `teacherId` se infiere del usuario autenticado; no hace falta enviarlo desde el cliente.

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET/PUT | `/api/teachers` | Perfil del profesor autenticado |
| GET/POST/PUT/DELETE | `/api/students` | CRUD alumnos |
| GET/POST/PUT/DELETE | `/api/subjects` | CRUD asignaturas |
| GET/POST/DELETE | `/api/availabilities` | Disponibilidades |
| GET/POST/PUT/DELETE | `/api/assignments` | Asignaciones de horario |
| GET/POST/DELETE | `/api/teacher_blocks` | Bloques personales |
| GET/POST/PUT/DELETE | `/api/slot_requests` | Solicitudes de horario |
| GET/POST/PUT/DELETE | `/api/subject_students` | Inscripciones en asignaturas |
| POST | `/api/auto_schedule` | Auto-agendar greedy |

## Auto-agendar

Algoritmo greedy: recorre alumnos por prioridad, coloca unidades de tiempo dentro de disponibilidades, respeta `slot_requests` y evita solapamientos. Borra assignments `origin='auto'` previos antes de recalcular.
