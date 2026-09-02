"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Share, Smartphone, X } from "lucide-react";
import { APP_SHORT_NAME } from "@/lib/pwa";
import {
  PWA_APP_INSTALLED_EVENT,
  PWA_INSTALL_AVAILABLE_EVENT,
  captureInstallPrompt,
  getDeferredInstallPrompt,
  getPwaPlatform,
  isInstallPromptSnoozed,
  isStandaloneDisplay,
  snoozeInstallPrompt,
  type BeforeInstallPromptEvent,
  type PwaPlatform,
} from "@/lib/pwaInstall";

function hideOnPath(pathname: string) {
  return pathname.startsWith("/~offline") || pathname.startsWith("/auth");
}

function hintFor(platform: PwaPlatform, canInstall: boolean) {
  if (canInstall) return "Añádela a tu pantalla de inicio para usarla como una app.";
  if (platform === "ios") {
    return (
      <>
        Pulsa <Share size={14} className="install-prompt-share" aria-hidden /> y luego{" "}
        <strong>Añadir a pantalla de inicio</strong>.
      </>
    );
  }
  if (platform === "android") return "Abre el menú ⋮ del navegador y pulsa Instalar aplicación.";
  return "En la barra de direcciones, pulsa el icono de instalar.";
}

export default function InstallPrompt() {
  const pathname = usePathname() ?? "/";
  const [visible, setVisible] = useState(false);
  const [platform, setPlatform] = useState<PwaPlatform>("desktop");
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const hasDock =
    !pathname.startsWith("/login") &&
    !pathname.startsWith("/auth") &&
    !pathname.startsWith("/~offline");

  useEffect(() => {
    if (hideOnPath(pathname) || isStandaloneDisplay() || isInstallPromptSnoozed()) {
      setVisible(false);
      return;
    }

    setPlatform(getPwaPlatform());
    setDeferred(getDeferredInstallPrompt());

    const onAvailable = () => setDeferred(getDeferredInstallPrompt());
    const onInstalled = () => {
      snoozeInstallPrompt();
      setDeferred(null);
      setVisible(false);
    };
    const onBeforeInstall = (event: Event) => {
      setDeferred(captureInstallPrompt(event));
      setVisible(true);
    };

    window.addEventListener(PWA_INSTALL_AVAILABLE_EVENT, onAvailable);
    window.addEventListener(PWA_APP_INSTALLED_EVENT, onInstalled);
    window.addEventListener("appinstalled", onInstalled);
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    const timer = window.setTimeout(() => {
      if (isStandaloneDisplay() || isInstallPromptSnoozed()) return;
      setVisible(true);
    }, 800);

    return () => {
      window.removeEventListener(PWA_INSTALL_AVAILABLE_EVENT, onAvailable);
      window.removeEventListener(PWA_APP_INSTALLED_EVENT, onInstalled);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.clearTimeout(timer);
    };
  }, [pathname]);

  function dismiss() {
    snoozeInstallPrompt();
    setVisible(false);
  }

  async function install() {
    const promptEvent = deferred ?? getDeferredInstallPrompt();
    if (!promptEvent) return;
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    window.__pwaDeferredPrompt = null;
    setDeferred(null);
    if (outcome === "accepted") {
      snoozeInstallPrompt();
      setVisible(false);
    }
  }

  if (!visible || hideOnPath(pathname) || isStandaloneDisplay()) return null;

  const canInstall = Boolean(deferred);

  return (
    <div
      className={`install-prompt${hasDock ? " install-prompt-dock" : ""}`}
      role="dialog"
      aria-labelledby="install-prompt-title"
    >
      <div className="install-prompt-inner">
        <span className="install-prompt-icon" aria-hidden>
          <Smartphone size={20} />
        </span>
        <div className="install-prompt-copy">
          <p id="install-prompt-title" className="install-prompt-title">
            Instalar {APP_SHORT_NAME}
          </p>
          <p className="install-prompt-text">{hintFor(platform, canInstall)}</p>
        </div>
        {canInstall && (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => void install()}>
            Instalar
          </button>
        )}
        <button type="button" className="install-prompt-close" onClick={dismiss} aria-label="Cerrar">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
