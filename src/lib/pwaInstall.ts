export const PWA_INSTALL_STORAGE_KEY = "pwa-install-dismissed-at";
export const PWA_INSTALL_SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;
export const PWA_INSTALL_AVAILABLE_EVENT = "pwa-install-available";
export const PWA_APP_INSTALLED_EVENT = "pwa-appinstalled";

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export type PwaPlatform = "ios" | "android" | "desktop";

declare global {
  interface Window {
    __pwaDeferredPrompt?: BeforeInstallPromptEvent | null;
  }
}

export function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    window.matchMedia("(display-mode: minimal-ui)").matches ||
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone)
  );
}

export function isIosDevice(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return iOS && !("MSStream" in window);
}

export function getPwaPlatform(): PwaPlatform {
  if (isIosDevice()) return "ios";
  if (/Android/i.test(navigator.userAgent)) return "android";
  return "desktop";
}

export function isInstallPromptSnoozed(): boolean {
  if (typeof window === "undefined") return false;
  const raw = window.localStorage.getItem(PWA_INSTALL_STORAGE_KEY);
  if (!raw) return false;
  const at = Number(raw);
  if (!Number.isFinite(at)) return false;
  return Date.now() - at < PWA_INSTALL_SNOOZE_MS;
}

export function snoozeInstallPrompt(): void {
  window.localStorage.setItem(PWA_INSTALL_STORAGE_KEY, String(Date.now()));
}

export function clearInstallPromptSnooze(): void {
  window.localStorage.removeItem(PWA_INSTALL_STORAGE_KEY);
}

export function getDeferredInstallPrompt(): BeforeInstallPromptEvent | null {
  if (typeof window === "undefined") return null;
  return window.__pwaDeferredPrompt ?? null;
}

export function captureInstallPrompt(event: Event): BeforeInstallPromptEvent {
  event.preventDefault();
  const promptEvent = event as BeforeInstallPromptEvent;
  window.__pwaDeferredPrompt = promptEvent;
  window.dispatchEvent(new Event(PWA_INSTALL_AVAILABLE_EVENT));
  return promptEvent;
}
