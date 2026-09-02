"use client";

import { CalendarClock, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/lib/pwa";

export default function OfflinePage() {
  return (
    <div className="offline-page">
      <div className="offline-page-card">
        <span className="offline-page-logo" aria-hidden>
          <CalendarClock size={28} />
        </span>
        <span className="offline-page-icon" aria-hidden>
          <WifiOff size={22} />
        </span>
        <h1>Sin conexión</h1>
        <p>
          {APP_NAME} necesita internet para cargar horarios y alumnos. Revisa la red e inténtalo de
          nuevo.
        </p>
        <Button type="button" onClick={() => window.location.reload()}>
          Reintentar
        </Button>
      </div>
    </div>
  );
}
