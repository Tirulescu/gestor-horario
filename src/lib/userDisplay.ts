import type { User } from "@supabase/supabase-js";

/** Nombre visible desde la cuenta de Google (metadata de Supabase). */
export function getGoogleDisplayName(user: Pick<User, "email" | "user_metadata">): string {
  const meta = user.user_metadata ?? {};
  if (typeof meta.full_name === "string" && meta.full_name.trim()) return meta.full_name.trim();
  if (typeof meta.name === "string" && meta.name.trim()) return meta.name.trim();
  if (user.email) return user.email.split("@")[0] ?? "Usuario";
  return "Usuario";
}

export function getGoogleAvatarUrl(user: Pick<User, "user_metadata">): string | null {
  const url = user.user_metadata?.avatar_url;
  return typeof url === "string" && url.length > 0 ? url : null;
}
