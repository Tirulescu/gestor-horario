"use client";

import { useEffect, useState } from "react";
import { Share, Smartphone } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { APP_SHORT_NAME } from "@/lib/pwa";
import {
  PWA_APP_INSTALLED_EVENT,
  PWA_INSTALL_AVAILABLE_EVENT,
  getDeferredInstallPrompt,
  getPwaPlatform,
  isStandaloneDisplay,
  runInstallPrompt,
  type PwaPlatform,
} from "@/lib/pwaInstall";

function hintFor(platform: PwaPlatform, canInstall: boolean) {
  if (canInstall) return "Accede más rápido desde la pantalla de inicio, como cualquier otra app.";
  if (platform === "ios") {
    return (
      <>
        Pulsa <Share size={14} className="inline align-[-2px] text-blue-600" aria-hidden /> en Safari y elige{" "}
        <strong>Añadir a pantalla de inicio</strong>.
      </>
    );
  }
  if (platform === "android") return "Abre el menú ⋮ del navegador y pulsa Instalar aplicación.";
  return "En la barra de direcciones, pulsa el icono de instalar.";
}

export default function InstallAppCard() {
  const [hidden, setHidden] = useState(true);
  const [platform, setPlatform] = useState<PwaPlatform>("desktop");
  const [canInstall, setCanInstall] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (isStandaloneDisplay()) {
      setHidden(true);
      return;
    }
    setHidden(false);
    setPlatform(getPwaPlatform());
    setCanInstall(Boolean(getDeferredInstallPrompt()));

    const sync = () => setCanInstall(Boolean(getDeferredInstallPrompt()));
    const onInstalled = () => setHidden(true);

    window.addEventListener(PWA_INSTALL_AVAILABLE_EVENT, sync);
    window.addEventListener(PWA_APP_INSTALLED_EVENT, onInstalled);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener(PWA_INSTALL_AVAILABLE_EVENT, sync);
      window.removeEventListener(PWA_APP_INSTALLED_EVENT, onInstalled);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    setInstalling(true);
    try {
      const outcome = await runInstallPrompt();
      if (outcome === "accepted") setHidden(true);
      setCanInstall(Boolean(getDeferredInstallPrompt()));
    } finally {
      setInstalling(false);
    }
  }

  if (hidden) return null;

  return (
    <Card className="install-app-card p-5">
      <div className="flex items-start gap-3.5">
        <span className="install-app-card-icon" aria-hidden>
          <Smartphone size={22} />
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Instalar {APP_SHORT_NAME}</h2>
            <p className="text-sm text-gray-500 mt-1 leading-relaxed">{hintFor(platform, canInstall)}</p>
          </div>
          {canInstall && (
            <Button type="button" size="sm" loading={installing} onClick={() => void install()}>
              Instalar aplicación
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
