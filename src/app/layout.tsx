import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { ToastProvider } from "@/components/Toast";
import Warmup from "@/components/Warmup";
import AppShell from "@/components/AppShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agenda Tutorías",
  description: "Agenda inteligente de tutorías",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen">
        <ToastProvider>
          <Suspense fallback={null}>
            <AppShell>{children}</AppShell>
          </Suspense>
          <Warmup />
        </ToastProvider>
      </body>
    </html>
  );
}
