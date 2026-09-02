"use client";

import { clientPage } from "@/lib/clientPage";

const RequestsClient = clientPage(() => import("./RequestsClient"));

export default function RequestsPage() {
  return <RequestsClient />;
}
