"use client";

import { SerwistProvider } from "@serwist/turbopack/react";
import InstallPrompt from "@/components/InstallPrompt";

export default function PwaProvider({ children }: { children: React.ReactNode }) {
  return (
    <SerwistProvider
      swUrl="/serwist/sw.js"
      register
      cacheOnNavigation
      reloadOnOnline
      options={{ type: "module", updateViaCache: "none" }}
    >
      {children}
      <InstallPrompt />
    </SerwistProvider>
  );
}
