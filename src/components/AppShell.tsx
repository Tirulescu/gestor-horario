"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { CalendarClock } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import DesktopNav from "@/components/DesktopNav";
import { APP_NAME } from "@/lib/pwa";

export default function AppShell({
  children,
  authSlot,
}: {
  children: React.ReactNode;
  authSlot: React.ReactNode;
}) {
  const pathname = usePathname() ?? "/";
  const isAuthPage =
    pathname.startsWith("/login") || pathname.startsWith("/auth") || pathname.startsWith("/~offline");

  if (isAuthPage) {
    return <>{children}</>;
  }

  return (
    <>
      <header className="app-header sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between gap-4 py-3 app-header-inner">
            <Link href="/" className="app-logo flex items-center gap-2 font-semibold text-base sm:text-lg shrink-0">
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-blue-600 text-white shadow-sm">
                <CalendarClock size={18} />
              </span>
              <span>{APP_NAME}</span>
            </Link>

            <DesktopNav />

            {authSlot}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 sm:pt-8 overflow-x-hidden main-with-dock">
        {children}
      </main>

      <BottomNav />
    </>
  );
}
