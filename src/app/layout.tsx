import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Suspense } from "react";
import { ToastProvider } from "@/components/Toast";
import Warmup from "@/components/Warmup";
import AppShell from "@/components/AppShell";
import AuthMenuLoader from "@/components/AuthMenuLoader";
import PwaProvider from "@/components/PwaProvider";
import {
  APP_BACKGROUND_COLOR,
  APP_DESCRIPTION,
  APP_NAME,
  APP_SHORT_NAME,
  APP_THEME_COLOR,
  APPLE_SPLASH_SCREENS,
  splashPath,
} from "@/lib/pwa";
import "./globals.css";

export const metadata: Metadata = {
  applicationName: APP_NAME,
  title: {
    default: APP_NAME,
    template: `%s · ${APP_SHORT_NAME}`,
  },
  description: APP_DESCRIPTION,
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: APP_SHORT_NAME,
    startupImage: APPLE_SPLASH_SCREENS.map((screen) => ({
      url: splashPath(screen.width, screen.height),
      media: screen.media,
    })),
  },
  formatDetection: {
    telephone: false,
    date: false,
    email: false,
    address: false,
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32", type: "image/x-icon" },
      { url: "/icons/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: APP_THEME_COLOR,
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body
        className="min-h-dvh"
        style={{ backgroundColor: APP_BACKGROUND_COLOR }}
      >
        <PwaProvider>
          <ToastProvider>
            <Suspense fallback={null}>
              <AppShell authSlot={<AuthMenuLoader />}>{children}</AppShell>
            </Suspense>
            <Warmup />
          </ToastProvider>
        </PwaProvider>
        <Script id="pwa-install-capture" strategy="beforeInteractive">
          {`(function(){if(typeof window==="undefined")return;window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.__pwaDeferredPrompt=e;window.dispatchEvent(new Event("pwa-install-available"));});window.addEventListener("appinstalled",function(){window.__pwaDeferredPrompt=null;window.dispatchEvent(new Event("pwa-appinstalled"));});})();`}
        </Script>
      </body>
    </html>
  );
}
