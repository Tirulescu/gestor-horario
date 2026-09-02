"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import PageStackBoot from "@/components/PageStackBoot";

/** Monta la página solo en cliente: la caché en memoria está disponible en el primer render. */
export function clientPage<P extends object>(
  loader: () => Promise<{ default: ComponentType<P> }>,
) {
  return dynamic(loader, { ssr: false, loading: () => <PageStackBoot /> });
}
