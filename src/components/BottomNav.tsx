"use client";

import { Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { getMainNavItems } from "@/lib/mainNav";
import { prefetchRoute } from "@/lib/clientCache";

function BottomNavInner() {
  const pathname = usePathname() ?? "/";
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const items = getMainNavItems();
  const navRef = useRef<HTMLElement>(null);
  const itemRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const [pill, setPill] = useState<{ left: number; width: number; height: number; top: number } | null>(
    null,
  );

  useEffect(() => {
    setPendingPath(null);
  }, [pathname]);

  const displayPath = pendingPath ?? pathname;
  const activeIndex = Math.max(
    0,
    items.findIndex((item) => item.isActive(displayPath)),
  );

  useLayoutEffect(() => {
    const nav = navRef.current;
    const item = itemRefs.current[activeIndex];
    if (!nav || !item) return;

    const update = () => {
      const navRect = nav.getBoundingClientRect();
      const itemRect = item.getBoundingClientRect();
      setPill({
        left: itemRect.left - navRect.left,
        top: itemRect.top - navRect.top,
        width: itemRect.width,
        height: itemRect.height,
      });
    };

    update();

    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    ro?.observe(nav);
    window.addEventListener("resize", update);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [activeIndex]);

  return (
    <nav ref={navRef} className="bottom-dock" aria-label="Navegación principal">
      {pill && (
        <motion.span
          aria-hidden
          className="dock-pill"
          initial={false}
          animate={{
            left: pill.left,
            top: pill.top,
            width: pill.width,
            height: pill.height,
          }}
          transition={{ type: "spring", stiffness: 520, damping: 36, mass: 0.7 }}
        />
      )}
      {items.map((item, index) => {
        const Icon = item.icon;
        const active = index === activeIndex;
        return (
          <Link
            key={item.label}
            href={item.href}
            ref={(el) => {
              itemRefs.current[index] = el;
            }}
            className={`dock-item ${active ? "dock-active" : ""}`}
            aria-label={item.label}
            aria-current={active ? "page" : undefined}
            onClick={(e) => {
              if (
                e.defaultPrevented ||
                e.button !== 0 ||
                e.metaKey ||
                e.ctrlKey ||
                e.shiftKey ||
                e.altKey
              ) {
                return;
              }
              // Mueve el pill en el mismo gesto, antes de que cargue la página.
              setPendingPath(item.href);
              prefetchRoute(item.href);
              const nav = navRef.current;
              if (!nav) return;
              const navRect = nav.getBoundingClientRect();
              const itemRect = e.currentTarget.getBoundingClientRect();
              setPill({
                left: itemRect.left - navRect.left,
                top: itemRect.top - navRect.top,
                width: itemRect.width,
                height: itemRect.height,
              });
            }}
          >
            <span className="dock-item-inner">
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
