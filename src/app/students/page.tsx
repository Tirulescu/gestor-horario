"use client";

import { clientPage } from "@/lib/clientPage";

const StudentsClient = clientPage(() => import("@/components/StudentsClient"));

export default function StudentsPage() {
  return (
    <div className="page-stack">
      <StudentsClient />
    </div>
  );
}
