"use client";

import { useState } from "react";
import { ProfileModal } from "./ProfileModal";

export function ProfileButton({ size = "sm" }: { size?: "sm" | "md" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={`btn btn-ghost ${size === "sm" ? "btn-sm" : ""}`}
        onClick={() => setOpen(true)}
      >
        Profile
      </button>
      {open && <ProfileModal userId="me" onClose={() => setOpen(false)} />}
    </>
  );
}
