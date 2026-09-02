"use client";

import { clientPage } from "@/lib/clientPage";

const SubjectsPageClient = clientPage(() => import("./SubjectsPageClient"));

export default function SubjectsPage() {
  return <SubjectsPageClient />;
}
