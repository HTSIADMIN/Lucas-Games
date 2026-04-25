"use client";

import { useRouter } from "next/navigation";

export function SignOutButton() {
  const router = useRouter();
  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/sign-in");
    router.refresh();
  }
  return (
    <button className="btn btn-ghost btn-sm" onClick={signOut}>
      Sign out
    </button>
  );
}
