"use client";

import { clientPage } from "@/lib/clientPage";

const ProfileClient = clientPage(() => import("./ProfileClient"));

export default function ProfilePage() {
  return <ProfileClient />;
}
