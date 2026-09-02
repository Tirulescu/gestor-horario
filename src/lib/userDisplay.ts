import type { User } from "@supabase/supabase-js";

/** Nombre visible desde la cuenta de Google (metadata de Supabase). */
export function getGoogleDisplayName(user: Pick<User, "email" | "user_metadata">): string {
  const meta = user.user_metadata ?? {};
  if (typeof meta.full_name === "string" && meta.full_name.trim()) return meta.full_name.trim();
  if (typeof meta.name === "string" && meta.name.trim()) return meta.name.trim();
  if (user.email) return user.email.split("@")[0] ?? "Usuario";
  return "Usuario";
}
