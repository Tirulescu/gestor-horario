"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronUp, Maximize2, Minimize2 } from "lucide-react";
import { DAYS } from "@/lib/validate";
import { fmtHour } from "@/lib/hours";

export interface WeekBlock {
  id: number;
  dayOfWeek: number;
  startHour: number;
  endHour: number;
  title: string;
  subtitle?: string;
  color: string;
}

interface WeekGridProps {
  blocks?: WeekBlock[];
  startH?: number;
  endH?: number;
  onBlockClick?: (b: WeekBlock) => void;
  showLegend?: boolean;
  legend?: { label: string; color: string; dashed?: boolean }[];
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
  hourHeight = 72,
  compact = false,
  expandMobile = false,
  allowFullscreen = false,
  fullscreenTitle = "Horario semanal",
  inDialog = false,
}: WeekGridProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const fullscreenBodyRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fitHourHeight, setFitHourHeight] = useState(hourHeight);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const exitFullscreen = useCallback(() => setIsFullscreen(false), []);

  useEffect(() => {
    if (!isFullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") exitFullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isFullscreen, exitFullscreen]);

  useEffect(() => {
    const active = isFullscreen || (expandMobile && expanded);
    document.body.classList.toggle("weekgrid-fullscreen-active", active);
    return () => document.body.classList.remove("weekgrid-fullscreen-active");
  }, [isFullscreen, expandMobile, expanded]);

  useEffect(() => {
    if (!expandMobile) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        // Solo expandir cuando el usuario ha hecho scroll más allá del calendario (no si está debajo del pliegue)
        setExpanded(!entry.isIntersecting && entry.boundingClientRect.top < 0);
      },
      { threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [expandMobile]);

  const totalHoursRef = useRef(0);

  const colTemplate = isFullscreen
    ? `var(--weekgrid-gutter, 52px) repeat(7, 1fr)`
    : `var(--weekgrid-gutter, 52px) repeat(7, minmax(var(--weekgrid-col-min, 128px), 1fr))`;
  const allHours = useMemo(
    () => [...blocks.map((b) => b.startHour), ...blocks.map((b) => b.endHour)],
    [blocks]
  );
  const lo = Math.min(startH, ...allHours.filter((h) => Number.isFinite(h)), startH);
  const hi = Math.max(endH, ...allHours.filter((h) => Number.isFinite(h)), endH);
  const totalHours = hi - lo;
  totalHoursRef.current = totalHours;

  const effectiveHourHeight = isFullscreen ? fitHourHeight : hourHeight;

  const todayIdx = (new Date().getDay() + 6) % 7;
  const now = new Date();
  const nowHour = now.getHours() + now.getMinutes() / 60;
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

  const defaultLegend = useMemo(() => {
    const items: { label: string; color: string; dashed?: boolean }[] = [];
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
    if (!isFullscreen) {
      setFitHourHeight(hourHeight);
      return;
    }
    const body = fullscreenBodyRef.current;
    if (!body) return;

    const update = () => {
      const header = body.querySelector<HTMLElement>(".weekgrid-pro-header");
      const legendEl = body.querySelector<HTMLElement>(".weekgrid-legend");
      const toolbar = body.closest<HTMLElement>(".weekgrid-fullscreen-overlay")?.querySelector<HTMLElement>(".weekgrid-fullscreen-toolbar");
      const headerH = header?.offsetHeight ?? 40;
      const legendH = legendEl?.offsetHeight ?? 0;
      const toolbarH = toolbar?.offsetHeight ?? 48;
      const padding = 16;
      const available = window.innerHeight - toolbarH - legendH - headerH - padding;
      setFitHourHeight(Math.max(20, Math.floor(available / totalHoursRef.current)));
    };

    const ro = new ResizeObserver(update);
    ro.observe(body);
    window.addEventListener("resize", update);
    update();
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [isFullscreen, hourHeight, showLegend, legendItems.length]);

  const gridContent = (
    <div className="weekgrid-inner space-y-3">
      <div className="card weekgrid-pro-wrap p-0 overflow-hidden">
        <div className="weekgrid-pro" style={{ position: "relative" }}>
          <div
            className="weekgrid-pro-header"
            style={{ display: "grid", gridTemplateColumns: colTemplate }}
          >
            <div className="weekgrid-pro-corner">Hora</div>
            {DAYS.map((d, day) => (
              <div key={d} className={"weekgrid-pro-day" + (day === todayIdx ? " is-today" : "")}>
                {d}
                {day === todayIdx && <span className="today-tag">hoy</span>}
              </div>
            ))}
          </div>

          <div
            className="weekgrid-pro-body"
            style={{
              display: "grid",
              gridTemplateColumns: colTemplate,
              position: "relative",
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

            {DAYS.map((_, day) => (
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
                      className={"weekgrid-pro-block" + (onBlockClick ? " clickable" : "")}
                      style={{
                        position: "absolute",
                        top,
                        height,
                        left: `calc(${leftPct}% + 2px)`,
                        width: `calc(${widthPct}% - 4px)`,
                        background: block.color,
                      }}
                      onClick={() => onBlockClick?.(block)}
                      role={onBlockClick ? "button" : undefined}
                      tabIndex={onBlockClick ? 0 : undefined}
                      onKeyDown={(e) => {
                        if (onBlockClick && (e.key === "Enter" || e.key === " ")) {
                          e.preventDefault();
                          onBlockClick(block);
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

      {showLegend && legendItems.length > 0 && (
        <div className="weekgrid-legend">
          {legendItems.map((l) => (
            <span key={l.label} className="weekgrid-legend-item">
              <span
                className={"weekgrid-legend-swatch" + (l.dashed ? " dashed" : "")}
                style={{ background: l.dashed ? "transparent" : l.color, borderColor: l.color }}
              />
              {l.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );

  const rootClass =
    "weekgrid-root space-y-3" +
    (compact ? " weekgrid-compact" : "") +
    (inDialog ? " weekgrid-in-dialog" : "") +
    (isFullscreen ? " weekgrid-is-fullscreen" : "");

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
              <div className={rootClass.replace(" weekgrid-is-fullscreen", "")}>{gridContent}</div>
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
        <div className={"weekgrid-expand-mobile" + (expanded ? " is-expanded" : "")}>
          {!isFullscreen && gridContent}
          <div className="weekgrid-expand-hint" aria-hidden={!expanded}>
            <ChevronUp size={12} />
            Desliza hacia arriba para salir
          </div>
        </div>
        {fullscreenPortal}
      </div>
    );
  }

  return (
    <div className={rootClass}>
      {expandBtn && <div className="weekgrid-toolbar">{expandBtn}</div>}
      {!isFullscreen && gridContent}
      {fullscreenPortal}
    </div>
  );
}
