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
  return <EntityListSkeleton count={rows} />;
}

export function EntityListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="entity-list" aria-busy="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="entity-card">
          <div className="entity-card-header">
            <div className="space-y-2 flex-1 min-w-0">
              <Skeleton className="h-5 w-2/3 max-w-[12rem]" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <div className="flex gap-1.5">
              <Skeleton className="h-9 w-9 rounded-lg" />
              <Skeleton className="h-9 w-9 rounded-lg" />
            </div>
          </div>
          <div className="space-y-3 pt-1">
            <div className="space-y-2">
              <Skeleton className="h-3 w-24" />
              <div className="flex flex-wrap gap-1.5">
                <Skeleton className="h-6 w-16 rounded-full" />
                <Skeleton className="h-6 w-20 rounded-full" />
                <Skeleton className="h-6 w-14 rounded-full" />
              </div>
            </div>
            <div className="space-y-2 pt-2 border-t border-gray-100">
              <Skeleton className="h-3 w-28" />
              <div className="flex flex-wrap gap-1.5">
                <Skeleton className="h-6 w-24 rounded-full" />
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Skeleton de cards con enlace (lista de asignaturas). */
export function SubjectListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="entity-list" aria-busy="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="entity-card">
          <div className="entity-card-link pointer-events-none">
            <div className="entity-card-link-row">
              <div className="entity-card-link-title">
                <Skeleton className="h-9 w-9 shrink-0 rounded-[0.65rem]" />
                <div className="min-w-0 space-y-2 flex-1">
                  <Skeleton className="h-5 w-40 max-w-full" />
                  <Skeleton className="h-3.5 w-36 max-w-full" />
                </div>
              </div>
              <Skeleton className="h-5 w-5 shrink-0 rounded mt-1" />
            </div>
            <div className="entity-card-chips pl-[2.8rem]">
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-24 rounded-full" />
            </div>
          </div>
          <div className="entity-card-footer">
            <Skeleton className="h-9 w-9 rounded-lg" />
            <Skeleton className="h-9 w-9 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SubjectDetailSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="space-y-3">
        <Skeleton className="h-11 w-36 rounded-[0.6rem]" />
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="h-8 w-56 max-w-full" />
            <Skeleton className="h-4 w-48 max-w-full" />
          </div>
          <HeaderActionsSkeleton />
        </div>
      </div>
      <Card className="p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Skeleton className="h-6 w-40" />
          <div className="flex gap-2">
            <Skeleton className="h-9 w-32 rounded-lg" />
            <Skeleton className="h-9 w-36 rounded-lg" />
          </div>
        </div>
        <MemberCardSkeleton count={3} />
      </Card>
    </div>
  );
}

export function WeekGridSkeleton() {
  return <CardSkeleton rows={1} rowClassName="h-[32rem]" />;
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
      <Skeleton className="h-11 w-32 rounded-[0.6rem]" />
      <Skeleton className="h-11 w-40 rounded-[0.6rem]" />
      <Skeleton className="h-11 w-28 rounded-[0.6rem]" />
    </div>
  );
}
