import { createClient } from "@/lib/supabase/server";
import { getGoogleDisplayName } from "@/lib/userDisplay";
import AuthMenu from "@/components/AuthMenu";

export default async function AuthMenuLoader() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <AuthMenu
      initialDisplayName={user ? getGoogleDisplayName(user) : null}
      initialEmail={user?.email ?? null}
    />
  );
}
