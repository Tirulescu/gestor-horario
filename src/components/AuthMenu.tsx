"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CircleUserRound, LogIn, LogOut, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthMenuSkeleton } from "@/components/skeletons";
import { createClient } from "@/lib/supabase/client";
import { getGoogleDisplayName } from "@/lib/userDisplay";
import type { User } from "@supabase/supabase-js";

type MenuPos = { top: number; right: number };

type AuthMenuProps = {
  initialDisplayName?: string | null;
  initialEmail?: string | null;
};

export default function AuthMenu({
  initialDisplayName = null,
  initialEmail = null,
}: AuthMenuProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [displayName, setDisplayName] = useState<string | null>(initialDisplayName);
  const [email, setEmail] = useState<string | null>(initialEmail);
  const [loading, setLoading] = useState(initialDisplayName === null && initialEmail === null);
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null);
  const [mounted, setMounted] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isAuthPage = pathname?.startsWith("/login") || pathname?.startsWith("/auth");

  useEffect(() => {
    setMounted(true);
  }, []);

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
        return;
      }
      setDisplayName(getGoogleDisplayName(user));
      setEmail(user.email ?? null);
    }

    let cancelled = false;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      if (session?.user) syncUser(session.user);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (session?.user) {
        syncUser(session.user);
      } else if (event === "SIGNED_OUT") {
        syncUser(null);
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [isAuthPage]);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) {
      setMenuPos(null);
      return;
    }

    function updatePos() {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      setMenuPos({
        top: rect.bottom + 8,
        right: Math.max(8, window.innerWidth - rect.right),
      });
    }

    updatePos();
    window.addEventListener("resize", updatePos);
    window.addEventListener("scroll", updatePos, true);
    return () => {
      window.removeEventListener("resize", updatePos);
      window.removeEventListener("scroll", updatePos, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setOpen(false);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  if (isAuthPage) return null;

  async function signOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    setOpen(false);
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
    <div className="auth-menu">
      <button
        ref={buttonRef}
        type="button"
        className={`auth-user-chip ${open ? "auth-user-chip-open" : ""}`}
        title={displayName}
        aria-label={`Cuenta de ${displayName}`}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((prev) => !prev)}
      >
        <CircleUserRound size={22} strokeWidth={1.75} className="auth-user-glyph" aria-hidden />
        <span className="auth-user-name">{displayName}</span>
      </button>

      {mounted &&
        open &&
        menuPos &&
        createPortal(
          <div
            ref={dropdownRef}
            className="auth-menu-dropdown"
            role="menu"
            style={{ top: menuPos.top, right: menuPos.right }}
          >
            <div className="auth-menu-header">
              <p className="auth-menu-name">{displayName}</p>
              {email && <p className="auth-menu-email">{email}</p>}
            </div>
            <div className="auth-menu-actions">
              <Button asChild variant="outline" size="xs" className="w-full">
                <Link href="/profile" role="menuitem" onClick={() => setOpen(false)}>
                  <UserIcon size={14} className="auth-menu-action-icon" />
                  Perfil
                </Link>
              </Button>
              <Button
                variant="destructive"
                size="xs"
                className="w-full"
                role="menuitem"
                onClick={signOut}
                loading={signingOut}
              >
                <LogOut size={14} className="auth-menu-action-icon" />
                Cerrar sesión
              </Button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
