"use client";

import {
  DASHBOARD_ENDPOINTS,
  hasFreshAll,
  REQUESTS_ENDPOINTS,
  STUDENTS_ENDPOINTS,
  warmData,
} from "@/lib/clientCache";

/** true en SSR; en cliente solo si aún no hay datos listos. */
export function bootPending(hasCachedData: boolean): boolean {
  if (typeof window === "undefined") return true;
  return !hasCachedData;
}

export function hasDashboardCache(): boolean {
  return (
    warmData("/api/teachers") !== null
    && warmData("/api/subjects") !== null
    && warmData("/api/assignments") !== null
    && warmData("/api/teacher_blocks") !== null
    && warmData("/api/availabilities") !== null
  );
}

export function hasStudentsCache(): boolean {
  return warmData("/api/students") !== null;
}

export function hasSubjectsListCache(): boolean {
  return warmData("/api/subjects") !== null;
}

export function hasRequestsCache(): boolean {
  return hasFreshAll(REQUESTS_ENDPOINTS);
}

export function dashboardBootPending(): boolean {
  return bootPending(hasDashboardCache() || hasFreshAll(DASHBOARD_ENDPOINTS));
}

export function studentsBootPending(): boolean {
  return bootPending(hasStudentsCache() || hasFreshAll(STUDENTS_ENDPOINTS));
}

export function subjectsBootPending(): boolean {
  return bootPending(hasSubjectsListCache());
}

export function requestsBootPending(): boolean {
  return bootPending(hasRequestsCache());
}
