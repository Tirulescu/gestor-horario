"use client";

import { useEffect, useState } from "react";
import DashboardClient from "@/app/dashboard/DashboardClient";
import RequestsClient from "@/app/requests/RequestsClient";
import SubjectsPageClient from "@/app/subjects/SubjectsPageClient";
import StudentsClient from "@/components/StudentsClient";
import { isMainTabPath, type MainTabPath, normalizeMainTabPath } from "@/lib/mainTabPaths";

const TABS: { path: MainTabPath; render: () => React.ReactNode }[] = [
  { path: "/dashboard", render: () => <DashboardClient /> },
  {
    path: "/students",
    render: () => (
      <div className="page-stack">
        <StudentsClient />
      </div>
    ),
  },
  { path: "/subjects", render: () => <SubjectsPageClient /> },
  { path: "/requests", render: () => <RequestsClient /> },
];

export default function AppTabHost({
  pathname,
  hostVisible,
}: {
  pathname: string;
  hostVisible: boolean;
}) {
  const activePath = isMainTabPath(pathname)
    ? (normalizeMainTabPath(pathname) as MainTabPath)
    : null;
  const [visited, setVisited] = useState<Set<MainTabPath>>(() =>
    activePath ? new Set([activePath]) : new Set(),
  );

  useEffect(() => {
    if (!activePath) return;
    setVisited((prev) => {
      if (prev.has(activePath)) return prev;
      const next = new Set(prev);
      next.add(activePath);
      return next;
    });
  }, [activePath]);

  return (
    <div className="app-tab-host" hidden={!hostVisible} aria-hidden={!hostVisible}>
      {TABS.map(({ path, render }) => {
        if (!visited.has(path)) return null;
        const active = activePath === path;
        return (
          <div key={path} className="app-tab-panel" hidden={!active} aria-hidden={!active}>
            {render()}
          </div>
        );
      })}
    </div>
  );
}
