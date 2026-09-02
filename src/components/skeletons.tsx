import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { SCHEDULE_DAY_END, SCHEDULE_DAY_START } from "@/lib/hours";
import { DAYS } from "@/lib/validate";

/** Mismo mínimo que WeekGrid cuando el día no tiene bloques. */
const EMPTY_DAY_MIN_PX = 72;
const DEFAULT_HOUR_HEIGHT = 84;

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

export function WeekGridSkeleton({
  expandMobile = true,
  allowFullscreen = true,
  startH = SCHEDULE_DAY_START,
  endH = SCHEDULE_DAY_END,
  hourHeight = DEFAULT_HOUR_HEIGHT,
}: {
  expandMobile?: boolean;
  allowFullscreen?: boolean;
  startH?: number;
  endH?: number;
  hourHeight?: number;
} = {}) {
  const todayIdx = (new Date().getDay() + 6) % 7;
  const totalHours = endH - startH;
  const bodyHeight = totalHours * hourHeight;
  const dayWidths = Array.from({ length: 7 }, () => EMPTY_DAY_MIN_PX);
  const gridContentMinPx = dayWidths.reduce((sum, w) => sum + w, 0);
  const colTemplate = `var(--weekgrid-gutter, 52px) ${dayWidths.map((px) => `${px}px`).join(" ")}`;
  const gridMinWidth = `calc(var(--weekgrid-gutter) + ${gridContentMinPx}px)`;
  const hours = Array.from({ length: totalHours }, (_, i) => startH + i);

  const gridContent = (
    <div className="weekgrid-inner space-y-3">
      <div className="card weekgrid-pro-wrap p-0">
        <div className="weekgrid-pro">
          <div className="weekgrid-pro-header-scroll">
            <div
              className="weekgrid-pro-header"
              style={{
                display: "grid",
                gridTemplateColumns: colTemplate,
                width: gridMinWidth,
                minWidth: gridMinWidth,
              }}
            >
              <div className="weekgrid-pro-corner">
                <Skeleton className="mx-auto h-3 w-8" />
              </div>
              {DAYS.map((d, day) => (
                <div
                  key={d}
                  className={"weekgrid-pro-day" + (day === todayIdx ? " is-today" : "")}
                >
                  <Skeleton className="mx-auto h-3.5 w-7" />
                </div>
              ))}
            </div>
          </div>
          <div className="weekgrid-pro-body-scroll">
            <div
              className="weekgrid-pro-body"
              style={{
                display: "grid",
                gridTemplateColumns: colTemplate,
                position: "relative",
                width: gridMinWidth,
                minWidth: gridMinWidth,
              }}
            >
              <div className="weekgrid-pro-gutter" style={{ position: "relative", height: bodyHeight }}>
                {hours.map((h) => (
                  <div
                    key={h}
                    className="weekgrid-pro-hour"
                    style={{
                      position: "absolute",
                      top: (h - startH) * hourHeight,
                      height: hourHeight,
                    }}
                  >
                    <Skeleton className="ml-auto mr-1 h-3 w-8" />
                  </div>
                ))}
              </div>
              {DAYS.map((d, dayIndex) => (
                <div
                  key={d}
                  className={"weekgrid-pro-col" + (dayIndex === todayIdx ? " is-today-col" : "")}
                  style={{ position: "relative", height: bodyHeight }}
                >
                  {hours.map((h) => (
                    <div key={h}>
                      <div
                        className="weekgrid-pro-line"
                        style={{
                          position: "absolute",
                          top: (h - startH) * hourHeight,
                          height: hourHeight,
                        }}
                      />
                      <div
                        className="weekgrid-pro-half-line"
                        style={{
                          position: "absolute",
                          top: (h - startH) * hourHeight + hourHeight / 2,
                          left: 0,
                          right: 0,
                        }}
                      />
                    </div>
                  ))}
                  {dayIndex % 2 === 0 && (
                    <Skeleton
                      className="absolute left-[3px] right-[3px] rounded-md opacity-80"
                      style={{ top: hourHeight * 2.5, height: hourHeight * 1.25 }}
                    />
                  )}
                  {dayIndex % 3 === 1 && (
                    <Skeleton
                      className="absolute left-[3px] right-[3px] rounded-md opacity-70"
                      style={{ top: hourHeight * 6, height: hourHeight * 1.75 }}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="weekgrid-root" aria-busy="true" aria-label="Cargando calendario">
      {allowFullscreen && (
        <div className="weekgrid-toolbar">
          <Skeleton className="h-[2.05rem] w-[5.5rem] rounded-lg" aria-hidden />
        </div>
      )}
      {expandMobile ? (
        <>
          <div className="weekgrid-scroll-sentinel" aria-hidden />
          <div className="weekgrid-expand-mobile">{gridContent}</div>
        </>
      ) : (
        gridContent
      )}
    </div>
  );
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

export function HeaderActionsSkeleton({ count = 3 }: { count?: number }) {
  const widths = ["w-32", "w-40", "w-28"];
  return (
    <div className="flex flex-wrap gap-2 items-center" aria-busy="true">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className={cn("h-11 rounded-[0.6rem]", widths[i % widths.length])} />
      ))}
    </div>
  );
}
