"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, LogIn, LogOut, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthMenuSkeleton } from "@/components/skeletons";
import { createClient } from "@/lib/supabase/client";
import { getGoogleAvatarUrl, getGoogleDisplayName } from "@/lib/userDisplay";
import type { User } from "@supabase/supabase-js";

function UserAvatar({ name, avatarUrl, size = 28 }: { name: string; avatarUrl: string | null; size?: number }) {
  if (avatarUrl) {
    return (
      <Image
        src={avatarUrl}
        alt=""
        width={size}
        height={size}
        className="rounded-full shrink-0 ring-2 ring-white"
        unoptimized
      />
    );
  }

  return (
    <span
      className="rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-semibold shrink-0 ring-2 ring-white"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

export default function AuthMenu() {
  const pathname = usePathname();
  const router = useRouter();
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isAuthPage = pathname?.startsWith("/login") || pathname?.startsWith("/auth");

  useEffect(() => {
    if (isAuthPage) {
      setLoading(false);
      return;
    }

    const supabase = createClient();

    function syncUser(user: User | null) {
      if (!user) {
        setDisplayName(null);
        setEmail(null);
        setAvatarUrl(null);
        return;
      }
      setDisplayName(getGoogleDisplayName(user));
      setEmail(user.email ?? null);
      setAvatarUrl(getGoogleAvatarUrl(user));
    }

    supabase.auth.getUser().then(({ data: { user } }) => {
      syncUser(user);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      syncUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, [isAuthPage]);

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  if (isAuthPage) return null;

  async function signOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  if (loading) {
    return <AuthMenuSkeleton />;
  }

  if (!displayName) {
    return (
      <Button asChild variant="outline" size="sm">
        <Link href="/login">
          <LogIn />
          <span className="hidden sm:inline">Entrar</span>
        </Link>
      </Button>
    );
  }

  return (
    <div className="auth-menu" ref={menuRef}>
      <button
        type="button"
        className={`auth-user-chip ${open ? "auth-user-chip-open" : ""}`}
        title={displayName}
        aria-label={`Cuenta de ${displayName}`}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((prev) => !prev)}
      >
        <UserAvatar name={displayName} avatarUrl={avatarUrl} size={28} />
        <span className="auth-user-name">{displayName}</span>
        <ChevronDown size={14} className="auth-user-chevron" aria-hidden />
      </button>

      {open && (
        <div className="auth-menu-dropdown" role="menu">
          <div className="auth-menu-header">
            <p className="auth-menu-name">{displayName}</p>
            {email && <p className="auth-menu-email">{email}</p>}
          </div>
          <div className="auth-menu-actions">
            <Button asChild variant="outline" size="xs" className="w-full">
              <Link href="/profile" role="menuitem" onClick={() => setOpen(false)}>
                <UserIcon size={14} />
                Perfil
              </Link>
            </Button>
            <Button
              variant="destructive"
              size="xs"
              className="w-full"
              role="menuitem"
              onClick={signOut}
              disabled={signingOut}
            >
              <LogOut size={14} />
              {signingOut ? "Cerrando…" : "Cerrar sesión"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
