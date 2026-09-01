import { Suspense } from "react";
import { LoginFormSkeleton } from "@/components/skeletons";
import LoginForm from "./LoginForm";

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFormSkeleton />}>
      <LoginForm />
    </Suspense>
  );
}
