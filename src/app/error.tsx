"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
      <h2 className="text-lg font-semibold text-gray-900">Algo ha fallado</h2>
      <p className="text-sm text-gray-500 max-w-md">{error.message || "Error inesperado al cargar la página."}</p>
      <Button onClick={reset}>Reintentar</Button>
    </div>
  );
}
