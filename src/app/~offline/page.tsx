"use client";

import { CalendarClock, WifiOff } from "lucide-react";
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
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
          Reintentar
        </button>
      </div>
    </div>
  );
}
