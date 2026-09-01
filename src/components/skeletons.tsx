import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function CardSkeleton({
  rows = 3,
  className,
  rowClassName,
}: {
  rows?: number;
  className?: string;
  rowClassName?: string;
}) {
  return (
    <Card className={cn("p-5 space-y-3", className)} aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn(
            "h-10 w-full rounded-lg",
            i === rows - 1 && rows > 1 && "w-3/4",
            rowClassName
          )}
        />
      ))}
    </Card>
  );
}

export function TableCardSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <Card className="p-5 overflow-x-auto" aria-busy="true">
      <div className="space-y-3">
        <Skeleton className="h-5 w-full max-w-md" />
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded-lg" />
        ))}
      </div>
    </Card>
  );
}

export function WeekGridSkeleton() {
  return <CardSkeleton rows={1} rowClassName="h-[26rem]" />;
}

export function ChipGroupSkeleton({ count = 3 }: { count?: number }) {
  const widths = ["w-28", "w-24", "w-32"];
  return (
    <div className="flex gap-2" aria-busy="true">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className={cn("h-9 rounded-full", widths[i % widths.length])} />
      ))}
    </div>
  );
}

export function MemberCardSkeleton({ count = 2 }: { count?: number }) {
  return (
    <div className="space-y-4" aria-busy="true">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="p-4 space-y-3">
          <div className="flex items-center gap-3">
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-5 w-32" />
            <Skeleton className="ml-auto h-5 w-16 rounded-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
        </Card>
      ))}
    </div>
  );
}

export function LoginFormSkeleton() {
  return (
    <div className="login-page mx-auto w-full max-w-sm space-y-6" aria-busy="true">
      <div className="flex flex-col items-center space-y-2 text-center">
        <Skeleton className="mb-2 h-14 w-14 rounded-2xl" />
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>
      <Card className="p-6">
        <Skeleton className="h-12 w-full rounded-lg" />
      </Card>
    </div>
  );
}

export function AuthMenuSkeleton() {
  return <Skeleton className="h-9 w-9 rounded-full sm:h-9 sm:w-28 sm:rounded-lg" aria-hidden />;
}

export function BadgeGroupSkeleton() {
  return (
    <div className="flex gap-1" aria-busy="true">
      <Skeleton className="h-5 w-20 rounded-full" />
      <Skeleton className="h-5 w-16 rounded-full" />
    </div>
  );
}

export function HeaderActionsSkeleton() {
  return (
    <div className="flex flex-wrap gap-2 items-center" aria-busy="true">
      <Skeleton className="h-9 w-32 rounded-lg" />
      <Skeleton className="h-9 w-36 rounded-lg" />
      <Skeleton className="h-9 w-28 rounded-lg" />
      <Skeleton className="h-9 w-36 sm:w-44 rounded-lg" />
    </div>
  );
}
