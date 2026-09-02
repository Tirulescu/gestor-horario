"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getMainNavItems } from "@/lib/mainNav";
import type { NavItem } from "@/lib/mainNav";
import { prefetchRoute } from "@/lib/clientCache";

function NavLink({
  item,
  active,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  onNavigate: (href: string) => void;
}) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      className={`desktop-nav-item ${active ? "desktop-nav-active" : ""}`}
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
        onNavigate(item.href);
        prefetchRoute(item.href);
      }}
    >
      <Icon size={17} strokeWidth={active ? 2.4 : 2} />
      <span>{item.label}</span>
    </Link>
  );
}

export default function DesktopNav() {
  const pathname = usePathname() ?? "/";
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const mainItems = getMainNavItems();

  useEffect(() => {
    setPendingPath(null);
  }, [pathname]);

  const displayPath = pendingPath ?? pathname;

  return (
    <nav className="desktop-nav" aria-label="Navegación principal">
      <div className="desktop-nav-inner">
        {mainItems.map((item) => (
          <NavLink
            key={item.label}
            item={item}
            active={item.isActive(displayPath)}
            onNavigate={setPendingPath}
          />
        ))}
      </div>
    </nav>
  );
}
