"use client";

import { clientPage } from "@/lib/clientPage";

const DashboardClient = clientPage(() => import("./DashboardClient"));

export default function DashboardPage() {
  return <DashboardClient />;
}
