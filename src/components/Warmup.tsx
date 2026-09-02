"use client";

import { useEffect } from "react";
import { prefetchAll, ROUTE_PREFETCH } from "@/lib/clientCache";

export default function Warmup() {
  useEffect(() => {
    const path = window.location.pathname;
    const skip = Object.entries(ROUTE_PREFETCH).find(([href]) =>
      path === href || path.startsWith(`${href}/`),
    )?.[1];

    prefetchAll({ delayMs: 400, skip });
  }, []);

  return null;
}
