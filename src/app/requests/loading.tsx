import { TableCardSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="page-stack">
      <TableCardSkeleton rows={4} />
    </div>
  );
}
