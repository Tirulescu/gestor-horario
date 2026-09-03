import type { LucideIcon } from "lucide-react";
import { BookOpen, CalendarDays, GraduationCap } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  isActive: (pathname: string) => boolean;
}

export function getMainNavItems(): NavItem[] {
  return [
    {
      href: "/dashboard",
      label: "Inicio",
      icon: CalendarDays,
      isActive: (pathname) => pathname === "/" || pathname.startsWith("/dashboard"),
    },
    {
      href: "/students",
      label: "Alumnos",
      icon: GraduationCap,
      isActive: (pathname) => pathname === "/students",
    },
    {
      href: "/subjects",
      label: "Asignaturas",
      icon: BookOpen,
      isActive: (pathname) => pathname === "/subjects" || pathname.startsWith("/subjects/"),
    },
  ];
}
