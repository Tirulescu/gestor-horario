"use client";

import { useEffect } from "react";
import { prefetchAll } from "@/lib/clientCache";

export default function Warmup() {
  useEffect(() => {
    prefetchAll();
  }, []);
  return null;
}