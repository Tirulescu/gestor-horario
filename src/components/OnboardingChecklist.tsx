"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BookOpen, GraduationCap, CalendarClock, ClipboardList, Sparkles, Check, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LucideIcon } from "lucide-react";
import {
  buildGuideSteps,
  dismissOnboarding,
  isOnboardingDismissed,
  type OnboardingData,
} from "@/lib/onboardingGuide";

export type { OnboardingData };
export { countIncompleteSlotRequests } from "@/lib/onboardingGuide";

interface OnboardingChecklistProps {
  data: OnboardingData;
  onOpenAvailability?: () => void;
  onAutoSchedule?: () => void;
}

interface Step {
  id: string;
  label: string;
  done: boolean;
  icon: LucideIcon;
  action?: React.ReactNode;
}

const STEP_ICONS: Record<string, LucideIcon> = {
  subjects: BookOpen,
  students: GraduationCap,
  availability: CalendarClock,
  requests: ClipboardList,
  schedule: Sparkles,
};

export default function OnboardingChecklist({
  data,
  onOpenAvailability,
  onAutoSchedule,
}: OnboardingChecklistProps) {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(isOnboardingDismissed());
  }, []);

  const steps: Step[] = useMemo(() => {
    const guideSteps = buildGuideSteps(data);
    return guideSteps.map((step) => ({
      id: step.id,
      label: step.label,
      done: step.done,
      icon: STEP_ICONS[step.id] ?? BookOpen,
      action:
        step.id === "availability" && onOpenAvailability ? (
          <Button size="sm" variant="outline" type="button" onClick={onOpenAvailability}>
            Añadir al horario
          </Button>
        ) : step.id === "schedule" && onAutoSchedule ? (
          <Button size="sm" type="button" onClick={onAutoSchedule}>
            Auto-agendar
          </Button>
        ) : step.href ? (
          <Button asChild size="sm" variant="outline">
            <Link href={step.href}>{step.hrefLabel ?? "Ir"}</Link>
          </Button>
        ) : undefined,
    }));
  }, [data, onOpenAvailability, onAutoSchedule]);

  const allDone = steps.every((s) => s.done);
  const doneCount = steps.filter((s) => s.done).length;

  if (dismissed || allDone) return null;

  function dismiss() {
    dismissOnboarding();
    setDismissed(true);
  }

  return (
    <section className="onboarding-card" aria-label="Pasos de configuración">
      <div className="onboarding-card-header">
        <div>
          <h2 className="onboarding-card-title">Configura tu horario</h2>
          <p className="onboarding-card-subtitle">
            {doneCount} de {steps.length} pasos completados ·{" "}
            <Link href="/profile" className="onboarding-profile-link">
              Ver guía completa
            </Link>
          </p>
        </div>
        <button
          type="button"
          className="onboarding-dismiss"
          onClick={dismiss}
          aria-label="Ocultar guía de configuración"
        >
          <X size={16} />
        </button>
      </div>
      <ol className="onboarding-steps">
        {steps.map((step) => {
          const Icon = step.icon;
          return (
            <li key={step.id} className={`onboarding-step ${step.done ? "onboarding-step-done" : ""}`}>
              <span className="onboarding-step-icon" aria-hidden>
                {step.done ? <Check size={16} /> : <Icon size={16} />}
              </span>
              <div className="onboarding-step-body">
                <span className="onboarding-step-label">{step.label}</span>
                {!step.done && step.action && (
                  <div className="onboarding-step-action">{step.action}</div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
