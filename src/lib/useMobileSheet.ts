"use client";

import { useSyncExternalStore } from "react";

const SHEET_MQ = "(max-width: 767px)";

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(SHEET_MQ);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function getSnapshot() {
  return window.matchMedia(SHEET_MQ).matches;
}

function getServerSnapshot() {
  return false;
}

/** Bottom-sheet layout/gestures for dialogs below the mobile breakpoint. */
export function useMobileSheet(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export const SHEET_DISMISS_OFFSET = 110;
export const SHEET_DISMISS_VELOCITY = 650;
