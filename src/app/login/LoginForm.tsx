"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { CalendarClock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { buildAuthCallbackUrl } from "@/lib/appUrl";
import { APP_NAME } from "@/lib/pwa";

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

export default function LoginForm() {
  const searchParams = useSearchParams();
  const authError = searchParams.get("error") === "auth";
  const [signingIn, setSigningIn] = useState(false);

  async function signInWithGoogle() {
    setSigningIn(true);
    const supabase = createClient();
    const next = searchParams.get("next") ?? "/";
    const redirectTo = buildAuthCallbackUrl(next);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });

    if (error) {
      console.error("Error al iniciar sesión:", error.message);
      setSigningIn(false);
    }
  }

  return (
    <div className="login-page w-full max-w-sm mx-auto space-y-6">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600 text-white mb-2 shadow-md">
          <CalendarClock size={28} />
        </div>
        <h1 className="text-2xl font-semibold text-gray-900">{APP_NAME}</h1>
        <p className="text-sm text-gray-500">Inicia sesión con Google</p>
      </div>

      <Card className="p-6 space-y-4 shadow-sm">
        {authError && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            No se pudo completar el inicio de sesión. Inténtalo de nuevo.
          </p>
        )}

        <Button
          type="button"
          variant="outline"
          className="w-full min-h-[48px] gap-3 text-base font-medium"
          onClick={signInWithGoogle}
          loading={signingIn}
        >
          <GoogleIcon />
          Continuar con Google
        </Button>
      </Card>
    </div>
  );
}
