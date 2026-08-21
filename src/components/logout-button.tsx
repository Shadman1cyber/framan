"use client";

import { LogOut } from "lucide-react";
import { logoutAction } from "@/server/actions/auth";

export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <button
        type="submit"
        title="Sign out"
        className="h-8 w-8 rounded-lg border border-line text-ink-faint hover:text-bad hover:border-bad/40 flex items-center justify-center transition-colors"
      >
        <LogOut className="h-3.5 w-3.5" />
      </button>
    </form>
  );
}
