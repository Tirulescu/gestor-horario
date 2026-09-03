"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronUp, Maximize2, Minimize2 } from "lucide-react";
import { DAYS } from "@/lib/validate";
import { computeVisibleScheduleRange, fmtHour, fmtDayRange } from "@/lib/hours";
import CalendarEventDetailDialog, { type CalendarEventDetailRow } from "@/components/CalendarEventDetailDialog";

const MIN_FIT_HOUR_HEIGHT = 10;
/** Suelo solo para cabecera del día vacío (sin forzar columnas anchas). */
const EMPTY_DAY_MIN_PX = 72;
const BLOCK_H_PAD_PX = 20; // padding del bloque + huecos de columna
const DAY_COL_PAD_PX = 8;

let measureCanvas: HTMLCanvasElement | null = null;

function measureTextPx(text: string, font: string): number {
  if (typeof document === "undefined") {
    return Math.ceil(text.length * 7);
  }
  if (!measureCanvas) measureCanvas = document.createElement("canvas");
  const ctx = measureCanvas.getContext("2d");
  if (!ctx) return Math.ceil(text.length * 7);
  ctx.font = font;
  return Math.ceil(ctx.measureText(text).width);
}

function zoneHours(zones?: Record<number, { start: number; end: number }[]>): number[] {
  if (!zones) return [];
  const out: number[] = [];
  for (const ranges of Object.values(zones)) {
    for (const r of ranges) out.push(r.start, r.end);
  }
  return out;
}

export interface WeekBlock {
  id: number;
  dayOfWeek: number;
  startHour: number;
  endHour: number;
  title: string;
  subtitle?: string;
  color: string;
  detailTitle?: string;
  details?: CalendarEventDetailRow[];
  /** Metadatos para acciones (p. ej. eliminar desde el calendario). */
  payload?: {
    kind: "student-block" | "assignment";
    studentId?: number;
    blockIndex?: number;
    assignmentId?: number;
  };
}

function estimateBlockContentPx(block: WeekBlock, compact: boolean): number {
  const titleSize = compact ? "10.4px" : "11.2px";
  const timeSize = compact ? "9px" : "9.92px";
  const titleFont = `600 ${titleSize} ui-sans-serif, system-ui, sans-serif`;
  const bodyFont = `400 ${titleSize} ui-sans-serif, system-ui, sans-serif`;
  const timeFont = `400 ${timeSize} ui-sans-serif, system-ui, sans-serif`;
  const title = measureTextPx(block.title, titleFont);
  const sub = block.subtitle ? measureTextPx(block.subtitle, bodyFont) : 0;
  const time = measureTextPx(`${fmtHour(block.startHour)}–${fmtHour(block.endHour)}`, timeFont);
  return Math.max(title, sub, time) + BLOCK_H_PAD_PX + DAY_COL_PAD_PX;
}

interface WeekGridProps {
  blocks?: WeekBlock[];
  startH?: number;
  endH?: number;
  onBlockClick?: (b: WeekBlock) => void;
  showLegend?: boolean;
  legend?: { label: string; color: string; dashed?: boolean; striped?: boolean }[];
  /** Zonas fuera de disponibilidad (sombreado). */
  unavailable?: Record<number, { start: number; end: number }[]>;
  /** Zonas disponibles (contorno verde). */
  availableZones?: Record<number, { start: number; end: number }[]>;
  /** Zonas bloqueadas (rojo). */
  blockedZones?: Record<number, { start: number; end: number }[]>;
  onAvailClick?: (zone: { day: number; start: number; end: number }) => void;
  onBlockedClick?: (zone: { day: number; start: number; end: number }) => void;
  hourHeight?: number;
  compact?: boolean;
  /** En móvil, al hacer scroll el calendario se expande a pantalla completa. */
  expandMobile?: boolean;
  /** Muestra un botón para ampliar el calendario a pantalla completa. */
  allowFullscreen?: boolean;
  /** Título mostrado en la barra del modo pantalla completa. */
  fullscreenTitle?: string;
  /** Variante para uso dentro de diálogos. */
  inDialog?: boolean;
  /** Oculta sábado (5) y domingo (6). */
  hideWeekends?: boolean;
}

export default function WeekGrid({
  blocks = [],
  startH = 7,
  endH = 23,
  onBlockClick,
  showLegend,
  legend,
  unavailable,
  availableZones,
  blockedZones,
  onAvailClick,
  onBlockedClick,
  hourHeight = 84,
  compact = false,
  expandMobile = false,
  allowFullscreen = false,
  fullscreenTitle = "Horario semanal",
  inDialog = false,
  hideWeekends = false,
}: WeekGridProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const bodyScrollRef = useRef<HTMLDivElement>(null);
  const syncingScrollRef = useRef(false);
  const expandMobileRef = useRef<HTMLDivElement>(null);
  const fullscreenBodyRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fitHourHeight, setFitHourHeight] = useState(hourHeight);
  const [mounted, setMounted] = useState(false);
  const [viewBlock, setViewBlock] = useState<WeekBlock | null>(null);

  const shouldFitViewport = isFullscreen || (expandMobile && expanded);

  useEffect(() => setMounted(true), []);

  const exitFullscreen = useCallback(() => setIsFullscreen(false), []);

  useEffect(() => {
    if (!isFullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Detalle / franja encima del modo ampliado: no salir todavía.
      if (
        viewBlock != null ||
        document.querySelector("[data-slot-overlap-dialog], [data-calendar-event-detail]")
      ) {
        return;
      }
      exitFullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isFullscreen, exitFullscreen, viewBlock]);

  useEffect(() => {
    // Solo bloquear scroll de página en modo pantalla completa explícito.
    // expandMobile usa sticky: bloquear body dejaba la PWA sin scroll al expandir.
    document.body.classList.toggle("weekgrid-fullscreen-active", isFullscreen);
    return () => document.body.classList.remove("weekgrid-fullscreen-active");
  }, [isFullscreen]);

  useEffect(() => {
    if (!expandMobile) return;
    const el = sentinelRef.current;
    if (!el) return;

    const isBodyScrollLocked = () => {
      const body = document.body;
      return (
        body.hasAttribute("data-scroll-locked") ||
        document.documentElement.hasAttribute("data-scroll-locked") ||
        getComputedStyle(body).overflow === "hidden"
      );
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        // Un diálogo abierto bloquea el scroll y falsea la intersección → el calendario salta.
        if (isBodyScrollLocked()) return;
        setExpanded(!entry.isIntersecting && entry.boundingClientRect.top < 0);
      },
      { threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [expandMobile]);

  const totalHoursRef = useRef(0);

  // No incluir `unavailable`: suele rellenar 7–23 y forzar el rango completo.
  const contentHours = useMemo(() => {
    const hours = [
      ...blocks.flatMap((b) => [b.startHour, b.endHour]),
      ...zoneHours(availableZones),
      ...zoneHours(blockedZones),
    ];
    return hours.filter((h) => Number.isFinite(h));
  }, [blocks, availableZones, blockedZones]);

  const visibleDays = useMemo(
    () => hideWeekends ? [0, 1, 2, 3, 4] : [0, 1, 2, 3, 4, 5, 6],
    [hideWeekends],
  );
  const dayCount = visibleDays.length;

  const todayIdx = (new Date().getDay() + 6) % 7;
  const nowHour = useMemo(() => {
    const now = new Date();
    return now.getHours() + now.getMinutes() / 60;
  }, []);

  const { lo, hi } = useMemo(
    () => computeVisibleScheduleRange(contentHours, startH, endH),
    [startH, endH, contentHours],
  );
  const totalHours = hi - lo;
  totalHoursRef.current = totalHours;

  const effectiveHourHeight = shouldFitViewport ? fitHourHeight : hourHeight;
  const showNowLine = nowHour >= lo && nowHour < hi;

  const hours: number[] = [];
  for (let h = lo; h < hi; h++) hours.push(h);

  const layout = useMemo(() => {
    const result: Record<number, { block: WeekBlock; col: number; cols: number }[]> = {};
    for (let day = 0; day < 7; day++) {
      const dayBlocks = blocks.filter((b) => b.dayOfWeek === day).sort((a, b) => a.startHour - b.startHour);
      const placed: { block: WeekBlock; col: number }[] = [];
      for (const b of dayBlocks) {
        let col = 0;
        while (true) {
          const overlap = placed.find(
            (p) => p.col === col && !(b.endHour <= p.block.startHour || b.startHour >= p.block.endHour)
          );
          if (!overlap) break;
          col++;
        }
        placed.push({ block: b, col });
      }
      const colsPerDay = placed.reduce((m, p) => Math.max(m, p.col + 1), 1);
      result[day] = placed.map((p) => ({ block: p.block, col: p.col, cols: colsPerDay }));
    }
    return result;
  }, [blocks]);

  /** Ancho fijo por día = texto más largo × carriles (sin base grande ni crecimiento fr). */
  const dayMinWidthsPx = useMemo(() => {
    return visibleDays.map((day) => {
      const dayLayout = layout[day] ?? [];
      if (dayLayout.length === 0) return EMPTY_DAY_MIN_PX;
      let maxLaneContent = 0;
      for (const { block, cols } of dayLayout) {
        maxLaneContent = Math.max(maxLaneContent, estimateBlockContentPx(block, compact) * cols);
      }
      return Math.max(EMPTY_DAY_MIN_PX, maxLaneContent);
    });
  }, [visibleDays, layout, compact, mounted]);

  const gridContentMinPx = useMemo(
    () => dayMinWidthsPx.reduce((sum, w) => sum + w, 0),
    [dayMinWidthsPx],
  );

  const colTemplate = shouldFitViewport
    ? `var(--weekgrid-gutter, 52px) repeat(${dayCount}, 1fr)`
    : `var(--weekgrid-gutter, 52px) ${dayMinWidthsPx.map((px) => `${px}px`).join(" ")}`;

  const defaultLegend = useMemo(() => {
    const items: { label: string; color: string; dashed?: boolean; striped?: boolean }[] = [];
    if (availableZones && Object.keys(availableZones).length > 0) {
      items.push({ label: "Disponible", color: "#22c55e", dashed: true });
    }
    if (blockedZones && Object.keys(blockedZones).length > 0) {
      items.push({ label: "Bloqueado", color: "#ef4444" });
    }
    return items;
  }, [availableZones, blockedZones]);

  const legendItems = legend ?? defaultLegend;

  useEffect(() => {
    if (!shouldFitViewport) {
      setFitHourHeight(hourHeight);
      return;
    }
    const container = isFullscreen ? fullscreenBodyRef.current : expandMobileRef.current;
    if (!container) return;

    const update = () => {
      const wrap = container.querySelector<HTMLElement>(".weekgrid-pro-wrap");
      const header = container.querySelector<HTMLElement>(".weekgrid-pro-header");
      const bodyScroll = container.querySelector<HTMLElement>(".weekgrid-pro-body-scroll");
      const body = container.querySelector<HTMLElement>(".weekgrid-pro-body");
      if (!wrap || totalHoursRef.current <= 0) return;

      let bodySpace = bodyScroll?.clientHeight
        || (wrap.clientHeight - (header?.offsetHeight ?? 0));
      if (body) {
        const bodyStyles = getComputedStyle(body);
        bodySpace -= (parseFloat(bodyStyles.marginTop) || 0) + (parseFloat(bodyStyles.marginBottom) || 0);
      }
      if (bodySpace <= 0) return;

      setFitHourHeight(Math.max(MIN_FIT_HOUR_HEIGHT, bodySpace / totalHoursRef.current));
    };

    const ro = new ResizeObserver(update);
    const wrap = container.querySelector<HTMLElement>(".weekgrid-pro-wrap");
    if (wrap) ro.observe(wrap);
    ro.observe(container);
    window.addEventListener("resize", update);
    requestAnimationFrame(update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [shouldFitViewport, isFullscreen, expanded, expandMobile, hourHeight, lo, hi, showLegend, legendItems.length]);

  const didScrollToNow = useRef(false);
  useEffect(() => {
    if (shouldFitViewport) {
      didScrollToNow.current = false;
      return;
    }
    const body = bodyScrollRef.current;
    if (!body || didScrollToNow.current) return;

    const scrollToNow = () => {
      if (didScrollToNow.current || body.clientHeight <= 0) return;
      const scrollHour = showNowLine
        ? nowHour
        : contentHours.length > 0
          ? Math.min(...contentHours)
          : lo;
      const pixelTop = (scrollHour - lo) * effectiveHourHeight;
      body.scrollTop = Math.max(0, pixelTop - body.clientHeight * 0.2);
      didScrollToNow.current = true;
    };

    scrollToNow();
    if (didScrollToNow.current) return;

    const ro = new ResizeObserver(() => {
      scrollToNow();
      if (didScrollToNow.current) ro.disconnect();
    });
    ro.observe(body);
    return () => ro.disconnect();
  }, [lo, hi, effectiveHourHeight, showNowLine, nowHour, contentHours, shouldFitViewport]);

  const handleBlockClick = useCallback(
    (block: WeekBlock) => {
      // En pantalla completa, igual que el calendario de alumnos: detalle centrado encima del overlay.
      if (isFullscreen || !onBlockClick) {
        setViewBlock(block);
        return;
      }
      onBlockClick(block);
    },
    [onBlockClick, isFullscreen],
  );

  const viewDialogRows: CalendarEventDetailRow[] = viewBlock
    ? (viewBlock.details ?? [
        { label: "Horario", value: fmtDayRange(viewBlock.dayOfWeek, viewBlock.startHour, viewBlock.endHour) },
      ])
    : [];

  const handleHeaderScroll = useCallback(() => {
    if (syncingScrollRef.current) return;
    const header = headerScrollRef.current;
    const body = bodyScrollRef.current;
    if (!header || !body) return;
    syncingScrollRef.current = true;
    body.scrollLeft = header.scrollLeft;
    syncingScrollRef.current = false;
  }, []);

  const handleBodyScroll = useCallback(() => {
    if (syncingScrollRef.current) return;
    const header = headerScrollRef.current;
    const body = bodyScrollRef.current;
    if (!header || !body) return;
    syncingScrollRef.current = true;
    header.scrollLeft = body.scrollLeft;
    syncingScrollRef.current = false;
  }, []);

  // Al llegar al tope/fondo del calendario, continuar el scroll en la página (o el diálogo).
  useEffect(() => {
    if (shouldFitViewport) return;
    const body = bodyScrollRef.current;
    if (!body) return;

    const scrollOuterBy = (deltaY: number) => {
      let node: HTMLElement | null = body.parentElement;
      while (node && node !== document.documentElement) {
        const { overflowY } = getComputedStyle(node);
        const scrollable =
          (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") &&
          node.scrollHeight > node.clientHeight + 1;
        if (scrollable) {
          node.scrollTop += deltaY;
          return;
        }
        node = node.parentElement;
      }
      window.scrollBy(0, deltaY);
    };

    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const maxScroll = body.scrollHeight - body.clientHeight;
      if (maxScroll <= 1) return;
      const atTop = body.scrollTop <= 0;
      const atBottom = body.scrollTop >= maxScroll - 1;
      if ((e.deltaY > 0 && atBottom) || (e.deltaY < 0 && atTop)) {
        e.preventDefault();
        scrollOuterBy(e.deltaY);
      }
    };

    body.addEventListener("wheel", onWheel, { passive: false });
    return () => body.removeEventListener("wheel", onWheel);
  }, [shouldFitViewport, isFullscreen, expanded, inDialog, lo, hi, effectiveHourHeight]);

  const gridMinWidth = shouldFitViewport
    ? undefined
    : `calc(var(--weekgrid-gutter) + ${gridContentMinPx}px)`;

  const gridContent = (
    <div className={"weekgrid-inner" + (shouldFitViewport ? " weekgrid-inner-fit" : " space-y-3")}>
      <div ref={wrapRef} className="card weekgrid-pro-wrap p-0">
        <div className="weekgrid-pro">
          <div
            ref={headerScrollRef}
            className="weekgrid-pro-header-scroll"
            onScroll={handleHeaderScroll}
          >
            <div
              className="weekgrid-pro-header"
              style={{
                display: "grid",
                gridTemplateColumns: colTemplate,
                width: gridMinWidth,
                minWidth: gridMinWidth,
              }}
            >
              <div className="weekgrid-pro-corner">Hora</div>
              {visibleDays.map((day) => (
                <div key={day} className={"weekgrid-pro-day" + (day === todayIdx ? " is-today" : "")}>
                  <span className="weekgrid-pro-day-label">{DAYS[day]}</span>
                  {day === todayIdx && <span className="today-tag">hoy</span>}
                </div>
              ))}
            </div>
          </div>

          <div
            ref={bodyScrollRef}
            className="weekgrid-pro-body-scroll"
            onScroll={handleBodyScroll}
          >
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
            <div className="weekgrid-pro-gutter" style={{ position: "relative", height: totalHours * effectiveHourHeight }}>
              {hours.map((h) => (
                <div
                  key={h}
                  className="weekgrid-pro-hour"
                  style={{ position: "absolute", top: (h - lo) * effectiveHourHeight, height: effectiveHourHeight }}
                >
                  <span>{fmtHour(h)}</span>
                </div>
              ))}
            </div>

            {visibleDays.map((day) => (
              <div
                key={day}
                className={"weekgrid-pro-col" + (day === todayIdx ? " is-today-col" : "")}
                style={{ position: "relative", height: totalHours * effectiveHourHeight }}
              >
                {hours.map((h) => (
                  <div key={h}>
                    <div
                      className="weekgrid-pro-line"
                      style={{ position: "absolute", top: (h - lo) * effectiveHourHeight, height: effectiveHourHeight }}
                    />
                    <div
                      className="weekgrid-pro-half-line"
                      style={{ position: "absolute", top: (h - lo) * effectiveHourHeight + effectiveHourHeight / 2, left: 0, right: 0 }}
                    />
                  </div>
                ))}

                {(unavailable?.[day] ?? []).map((u, i) => {
                  const top = (Math.max(u.start, lo) - lo) * effectiveHourHeight;
                  const h = (Math.min(u.end, hi) - Math.max(u.start, lo)) * effectiveHourHeight;
                  if (h <= 0) return null;
                  return (
                    <div
                      key={`u-${i}`}
                      className="weekgrid-pro-unavail"
                      style={{ position: "absolute", left: 0, right: 0, top, height: h }}
                    />
                  );
                })}

                {(availableZones?.[day] ?? []).map((a, i) => {
                  const top = (Math.max(a.start, lo) - lo) * effectiveHourHeight;
                  const h = (Math.min(a.end, hi) - Math.max(a.start, lo)) * effectiveHourHeight;
                  if (h <= 0) return null;
                  return (
                    <div
                      key={`az-${i}`}
                      className={"weekgrid-pro-availzone" + (onAvailClick ? " clickable" : "")}
                      style={{ position: "absolute", left: 3, right: 3, top, height: h }}
                      title={
                        onAvailClick
                          ? `Disponible ${fmtHour(a.start)}–${fmtHour(a.end)} — toca para editar`
                          : `Disponible ${fmtHour(a.start)}–${fmtHour(a.end)}`
                      }
                      onClick={() => onAvailClick?.({ day, start: a.start, end: a.end })}
                      role={onAvailClick ? "button" : undefined}
                      tabIndex={onAvailClick ? 0 : undefined}
                      onKeyDown={(e) => {
                        if (onAvailClick && (e.key === "Enter" || e.key === " ")) {
                          e.preventDefault();
                          onAvailClick({ day, start: a.start, end: a.end });
                        }
                      }}
                    />
                  );
                })}

                {(blockedZones?.[day] ?? []).map((b, i) => {
                  const top = (Math.max(b.start, lo) - lo) * effectiveHourHeight;
                  const h = (Math.min(b.end, hi) - Math.max(b.start, lo)) * effectiveHourHeight;
                  if (h <= 0) return null;
                  return (
                    <div
                      key={`bz-${i}`}
                      className={"weekgrid-pro-blockedzone" + (onBlockedClick ? " clickable" : "")}
                      style={{ position: "absolute", left: 3, right: 3, top, height: h }}
                      title={
                        onBlockedClick
                          ? `Bloqueado ${fmtHour(b.start)}–${fmtHour(b.end)} — toca para quitar`
                          : `Bloqueado ${fmtHour(b.start)}–${fmtHour(b.end)}`
                      }
                      onClick={() => onBlockedClick?.({ day, start: b.start, end: b.end })}
                      role={onBlockedClick ? "button" : undefined}
                      tabIndex={onBlockedClick ? 0 : undefined}
                    />
                  );
                })}

                {day === todayIdx && showNowLine && (
                  <div
                    className="weekgrid-pro-now"
                    style={{ position: "absolute", top: (nowHour - lo) * effectiveHourHeight, left: 0, right: 0 }}
                  >
                    <span className="weekgrid-pro-now-dot" />
                  </div>
                )}

                {(layout[day] ?? []).map(({ block, col, cols }) => {
                  const top = (block.startHour - lo) * effectiveHourHeight;
                  const height = (block.endHour - block.startHour) * effectiveHourHeight;
                  const widthPct = 100 / cols;
                  const leftPct = col * widthPct;
                  return (
                    <div
                      key={block.id}
                      className="weekgrid-pro-block clickable"
                      style={{
                        position: "absolute",
                        top,
                        height,
                        left: `calc(${leftPct}% + 2px)`,
                        width: `calc(${widthPct}% - 4px)`,
                        background: block.color,
                      }}
                      onClick={() => handleBlockClick(block)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleBlockClick(block);
                        }
                      }}
                    >
                      <div className="weekgrid-pro-block-title">{block.title}</div>
                      {block.subtitle && <div className="weekgrid-pro-block-sub">{block.subtitle}</div>}
                      <div className="weekgrid-pro-block-time">
                        {fmtHour(block.startHour)}–{fmtHour(block.endHour)}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
            </div>
          </div>
        </div>
      </div>

      {showLegend && legendItems.length > 0 && (
        <div className="weekgrid-legend">
          {legendItems.map((l) => (
            <span key={l.label} className="weekgrid-legend-item">
              <span
                className={
                  "weekgrid-legend-swatch" +
                  (l.dashed ? " dashed" : "") +
                  (l.striped ? " striped" : "")
                }
                style={
                  l.striped
                    ? undefined
                    : { background: l.dashed ? "transparent" : l.color, borderColor: l.color }
                }
              />
              {l.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );

  const rootClass =
    "weekgrid-root" +
    (compact ? " weekgrid-compact" : "") +
    (inDialog ? " weekgrid-in-dialog" : "") +
    (isFullscreen ? " weekgrid-is-fullscreen" : "") +
    (shouldFitViewport ? " weekgrid-fits-viewport" : "");

  const expandBtn = allowFullscreen && !isFullscreen ? (
    <button
      type="button"
      className="weekgrid-fullscreen-btn"
      onClick={() => setIsFullscreen(true)}
      aria-label="Ampliar calendario a pantalla completa"
    >
      <Maximize2 size={15} />
      <span>Ampliar</span>
    </button>
  ) : null;

  const fullscreenPortal =
    mounted && isFullscreen
      ? createPortal(
          <div
            className="weekgrid-fullscreen-overlay"
            role="dialog"
            aria-modal="true"
            aria-label="Calendario ampliado"
            style={{ pointerEvents: "auto" }}
          >
            <div className="weekgrid-fullscreen-toolbar">
              <span className="weekgrid-fullscreen-title">{fullscreenTitle}</span>
              <button
                type="button"
                className="weekgrid-fullscreen-btn weekgrid-fullscreen-close"
                onClick={exitFullscreen}
                aria-label="Salir de pantalla completa"
              >
                <Minimize2 size={16} />
                <span>Reducir</span>
              </button>
            </div>
            <div className="weekgrid-fullscreen-body" ref={fullscreenBodyRef}>
              <div
                className={
                  rootClass
                    .replace(" weekgrid-is-fullscreen", "")
                    .replace(" weekgrid-in-dialog", "") +
                  " weekgrid-fullscreen-host"
                }
              >
                {gridContent}
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  if (expandMobile) {
    return (
      <div className={rootClass}>
        {expandBtn && <div className="weekgrid-toolbar">{expandBtn}</div>}
        <div ref={sentinelRef} className="weekgrid-scroll-sentinel" aria-hidden />
        <div ref={expandMobileRef} className={"weekgrid-expand-mobile" + (expanded ? " is-expanded" : "")}>
          {!isFullscreen && gridContent}
          <div className="weekgrid-expand-hint" aria-hidden={!expanded}>
            <ChevronUp size={12} />
            Desliza hacia arriba para salir
          </div>
        </div>
        {fullscreenPortal}
        <CalendarEventDetailDialog
          open={viewBlock != null}
          onOpenChange={(o) => { if (!o) setViewBlock(null); }}
          title={viewBlock?.detailTitle ?? viewBlock?.title ?? "Detalle"}
          description={viewBlock?.subtitle}
          color={viewBlock?.color}
          rows={viewDialogRows}
        />
      </div>
    );
  }

  return (
    <div className={rootClass}>
      {expandBtn && <div className="weekgrid-toolbar">{expandBtn}</div>}
      {!isFullscreen && gridContent}
      {fullscreenPortal}
      <CalendarEventDetailDialog
        open={viewBlock != null}
        onOpenChange={(o) => { if (!o) setViewBlock(null); }}
        title={viewBlock?.detailTitle ?? viewBlock?.title ?? "Detalle"}
        description={viewBlock?.subtitle}
        color={viewBlock?.color}
        rows={viewDialogRows}
      />
    </div>
  );
}
