export const MAIN_TAB_PATHS = ["/dashboard", "/students", "/subjects", "/requests"] as const;

export type MainTabPath = (typeof MAIN_TAB_PATHS)[number];

export function normalizeMainTabPath(pathname: string): MainTabPath | string {
  const base = pathname === "/" || pathname === "" ? "/dashboard" : pathname.split("?")[0];
  return (MAIN_TAB_PATHS as readonly string[]).includes(base) ? (base as MainTabPath) : base;
}

export function isMainTabPath(pathname: string): boolean {
  const base = pathname === "/" || pathname === "" ? "/dashboard" : pathname.split("?")[0];
  return (MAIN_TAB_PATHS as readonly string[]).includes(base);
}
