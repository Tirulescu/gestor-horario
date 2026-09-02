"use client";

import { clientPage } from "@/lib/clientPage";

const SubjectDetailClient = clientPage(() => import("./SubjectDetailClient"));

export default function SubjectDetailPageClient({ id }: { id: number }) {
  return <SubjectDetailClient id={id} />;
}
