"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import {
  BookOpen, GraduationCap, CalendarClock, ClipboardList, Sparkles,
  Check, ChevronDown, ChevronRight, CircleHelp, PartyPopper,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  buildGuideSteps,
  countIncompleteSlotRequests,
  hasOnboardingCache,
  readOnboardingDataFromCache,
} from "@/lib/onboardingGuide";
import { put, fetchApi } from "@/lib/clientCache";

const STEP_ICONS: Record<string, LucideIcon> = {
  subjects: BookOpen,
  students: GraduationCap,
  availability: CalendarClock,
  requests: ClipboardList,
  schedule: Sparkles,
};

export default function SetupGuidePanel() {
  const [data, setData] = useState(readOnboardingDataFromCache);
  const [pending, setPending] = useState(() => !hasOnboardingCache());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function load() {
    const cached = readOnboardingDataFromCache();
    if (hasOnboardingCache()) {
      setData(cached);
      setPending(false);
    }

    const [subs, sts, av, ss, sr, asg] = await Promise.all([
      fetchApi<{ id: number }[]>("/api/subjects"),
      fetchApi<{ id: number }[]>("/api/students"),
      fetchApi<unknown[]>("/api/availabilities"),
      fetchApi<{ studentId: number; subjectId: number; slotsRequired?: number }[]>("/api/subject_students"),
      fetchApi<{ studentId: number; subjectId: number }[]>("/api/slot_requests"),
      fetchApi<unknown[]>("/api/assignments"),
    ]);

    const safeSubs = subs ?? [];
    const safeSts = sts ?? [];
    const safeAv = av ?? [];
    const safeSs = ss ?? [];
    const safeSr = sr ?? [];
    const safeAsg = asg ?? [];

    put("/api/subjects", safeSubs);
    put("/api/students", safeSts);
    put("/api/availabilities", safeAv);
    put("/api/subject_students", safeSs);
    put("/api/slot_requests", safeSr);
    put("/api/assignments", safeAsg);

    setData({
      subjectsCount: safeSubs.length,
      studentsCount: safeSts.length,
      availabilitiesCount: safeAv.length,
      incompleteRequests: countIncompleteSlotRequests(safeSs, safeSr),
      assignmentsCount: safeAsg.length,
    });
    setPending(false);
  }

  useEffect(() => { void load(); }, []);

  const steps = useMemo(() => buildGuideSteps(data), [data]);
  const doneCount = steps.filter((s) => s.done).length;
  const allDone = !pending && steps.length > 0 && doneCount === steps.length;
  const progressPct = pending ? 0 : Math.round((doneCount / steps.length) * 100);
  const nextStep = pending ? null : steps.find((s) => !s.done);

  function toggleStep(id: string) {
    setExpandedId((cur) => (cur === id ? null : id));
  }

  return (
    <section
      className={`guide-panel ${pending ? "guide-panel-pending" : ""}`}
      aria-labelledby="setup-guide-title"
      aria-busy={pending}
    >
      <div className="guide-panel-hero">
        <div className="guide-panel-hero-text">
          <div className="guide-panel-eyebrow">
            <CircleHelp size={15} aria-hidden />
            Autoayuda
          </div>
          <h2 id="setup-guide-title" className="guide-panel-title">
            Guía de configuración
          </h2>
          <p className="guide-panel-lead">
            {pending
              ? "Consulta los pasos mientras se calcula tu progreso."
              : allDone
                ? "¡Tu horario está configurado! Puedes consultar estos pasos cuando quieras."
                : "Sigue estos pasos en orden para dejar listo tu horario escolar."}
          </p>
        </div>
        <div
          className="guide-progress-ring"
          style={{ "--guide-progress": `${progressPct}%` } as CSSProperties}
          role="img"
          aria-label={
            pending
              ? "Calculando progreso"
              : `${doneCount} de ${steps.length} pasos completados`
          }
        >
          <span className="guide-progress-ring-inner">
            {pending ? (
              <span className="guide-progress-pending">…</span>
            ) : (
              <>
                <strong>{doneCount}</strong>
                <span>/{steps.length}</span>
              </>
            )}
          </span>
        </div>
      </div>

      {!pending && allDone ? (
        <div className="guide-complete-banner">
          <PartyPopper size={20} className="text-emerald-600 shrink-0" aria-hidden />
          <div>
            <p className="font-medium text-sm text-emerald-900">Configuración completa</p>
            <p className="text-xs text-emerald-700/80 mt-0.5">
              Puedes revisar o ajustar cualquier paso desde las secciones correspondientes.
            </p>
          </div>
        </div>
      ) : !pending && nextStep ? (
        <div className="guide-next-banner">
          <Badge variant="gray" className="shrink-0">Siguiente paso</Badge>
          <p className="text-sm text-gray-700">{nextStep.label}</p>
          {nextStep.href && (
            <Button asChild size="sm" className="ml-auto shrink-0">
              <Link href={nextStep.href}>{nextStep.hrefLabel ?? "Continuar"}</Link>
            </Button>
          )}
        </div>
      ) : null}

      <ol className="guide-steps-list">
        {steps.map((step, index) => {
          const Icon = STEP_ICONS[step.id] ?? BookOpen;
          const expanded = expandedId === step.id;
          const stepDone = !pending && step.done;
          return (
            <li
              key={step.id}
              className={`guide-step-item ${stepDone ? "guide-step-item-done" : ""} ${expanded ? "guide-step-item-open" : ""}`}
            >
              <button
                type="button"
                className="guide-step-trigger"
                onClick={() => toggleStep(step.id)}
                aria-expanded={expanded}
              >
                <span className="guide-step-num" aria-hidden>
                  {stepDone ? <Check size={14} /> : index + 1}
                </span>
                <span className="guide-step-icon-wrap" aria-hidden>
                  <Icon size={16} />
                </span>
                <span className="guide-step-title">{step.label}</span>
                <span className="guide-step-chevron" aria-hidden>
                  {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </span>
              </button>
              {expanded && (
                <div className="guide-step-detail">
                  <p className="guide-step-tip">{step.tip}</p>
                  {step.href && (
                    <Button
                      asChild
                      size="sm"
                      variant={stepDone ? "outline" : "default"}
                      disabled={pending}
                    >
                      <Link href={step.href} tabIndex={pending ? -1 : undefined}>
                        {step.hrefLabel ?? "Ir"}
                      </Link>
                    </Button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
