import { SubjectListSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="page-stack">
      <SubjectListSkeleton count={4} />
    </div>
  );
}
