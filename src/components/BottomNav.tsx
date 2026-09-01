"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { getMainNavItems } from "@/lib/mainNav";

function BottomNavInner() {
  const pathname = usePathname() ?? "/";
  const items = getMainNavItems();

  return (
    <nav className="bottom-dock" aria-label="Navegación principal">
      {items.map((item) => {
        const Icon = item.icon;
        const active = item.isActive(pathname);
        return (
          <Link
            key={item.label}
            href={item.href}
            className={`dock-item ${active ? "dock-active" : ""}`}
            aria-label={item.label}
            aria-current={active ? "page" : undefined}
          >
            <span className="relative inline-flex flex-col items-center gap-0.5 px-2.5 py-1.5">
              {active && (
                <motion.span
                  layoutId="dock-pill"
                  className="absolute inset-0 -z-10 rounded-xl bg-blue-50"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
              <Icon size={20} strokeWidth={active ? 2.4 : 2} />
              <span className="dock-label">{item.label}</span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

export default function BottomNav() {
  return (
    <Suspense fallback={null}>
      <BottomNavInner />
    </Suspense>
  );
}
