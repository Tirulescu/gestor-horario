import { Suspense } from "react";
import { MemberCardSkeleton } from "@/components/skeletons";
import RequestsClient from "./RequestsClient";

export default function RequestsPage() {
  return (
    <Suspense fallback={<MemberCardSkeleton count={2} />}>
      <RequestsClient />
    </Suspense>
  );
}