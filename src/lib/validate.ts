export function validateHourRange(start: number, end: number): string | null {
  const okHalf = (n: number) => Number.isFinite(n) && Math.abs(n - Math.round(n * 2) / 2) < 1e-9;
  if (!okHalf(start) || !okHalf(end)) {
    return "Las horas deben ser en punto o y media (XX:00 o XX:30)";
  }
  if (start < 0 || start > 23 || end < 0 || end > 24) {
    return "Las horas deben estar entre 0 y 24";
  }
  if (start >= end) {
    return "hora_inicio debe ser menor que hora_fin";
  }
  return null;
}

export function validateDay(day: number): string | null {
  if (!Number.isInteger(day) || day < 0 || day > 6) {
    return "El día debe estar entre 0 (lunes) y 6 (domingo)";
  }
  return null;
}

export const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
export const DAYS_LONG = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

export function apiError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export async function safeJson(req: Request): Promise<Record<string, unknown>> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}