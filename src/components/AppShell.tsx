"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { CalendarClock } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import DesktopNav from "@/components/DesktopNav";
import AuthMenu from "@/components/AuthMenu";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const isAuthPage = pathname.startsWith("/login") || pathname.startsWith("/auth");

  if (isAuthPage) {
    return <>{children}</>;
  }

  return (
    <>
      <header className="app-header sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between gap-4 py-3">
            <Link href="/" className="app-logo flex items-center gap-2 font-semibold text-base sm:text-lg shrink-0">
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-blue-600 text-white shadow-sm">
                <CalendarClock size={18} />
              </span>
              <span className="hidden sm:inline">Gestor horario</span>
              <span className="sm:hidden">Horario</span>
            </Link>

            <DesktopNav />

            <AuthMenu />
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 overflow-x-hidden main-with-dock">
        {children}
      </main>

      <BottomNav />
    </>
  );
}
