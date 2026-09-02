"use client";

import {
  DASHBOARD_ENDPOINTS,
  hasFreshAll,
  REQUESTS_ENDPOINTS,
  STUDENTS_ENDPOINTS,
  warmData,
} from "@/lib/clientCache";

export function hasDashboardCache(): boolean {
  return hasFreshAll(DASHBOARD_ENDPOINTS);
}

export function hasStudentsCache(): boolean {
  return hasFreshAll(STUDENTS_ENDPOINTS);
}

export function hasSubjectsListCache(): boolean {
  return warmData("/api/subjects") !== null;
}

export function hasRequestsCache(): boolean {
  return hasFreshAll(REQUESTS_ENDPOINTS);
}
