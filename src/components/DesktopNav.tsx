"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { getMainNavItems } from "@/lib/mainNav";
import type { NavItem } from "@/lib/mainNav";

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const Icon = item.icon;
  const active = item.isActive(pathname);

  return (
    <Link
      href={item.href}
      className={`desktop-nav-item ${active ? "desktop-nav-active" : ""}`}
      aria-current={active ? "page" : undefined}
    >
      <Icon size={17} strokeWidth={active ? 2.4 : 2} />
      <span>{item.label}</span>
    </Link>
  );
}

export default function DesktopNav() {
  const pathname = usePathname() ?? "/";
  const mainItems = getMainNavItems();

  return (
    <nav className="desktop-nav" aria-label="Navegación principal">
      <div className="desktop-nav-inner">
        {mainItems.map((item) => (
          <NavLink key={item.label} item={item} pathname={pathname} />
        ))}
      </div>
    </nav>
  );
}
