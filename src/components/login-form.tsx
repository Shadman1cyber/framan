"use client";

import { useActionState } from "react";
import { loginAction } from "@/server/actions/auth";
import { Loader2 } from "lucide-react";

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, null);

  return (
    <form action={action} className="mt-8 space-y-4">
      <div>
        <label htmlFor="email" className="block text-xs font-medium text-ink-dim mb-1.5 uppercase tracking-wide">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          defaultValue="sara@farman.dev"
          className="w-full h-10 rounded-lg bg-bg border border-line px-3 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition"
        />
      </div>
      <div>
        <label htmlFor="password" className="block text-xs font-medium text-ink-dim mb-1.5 uppercase tracking-wide">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          defaultValue="farman123"
          className="w-full h-10 rounded-lg bg-bg border border-line px-3 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition"
        />
      </div>

      {state?.error && (
        <p className="text-sm text-bad bg-bad/10 border border-bad/20 rounded-lg px-3 py-2">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full h-10 rounded-lg bg-accent hover:bg-accent-strong disabled:opacity-60 text-[#04211d] font-semibold text-sm transition flex items-center justify-center gap-2"
      >
        {pending && <Loader2 className="h-4 w-4 spin" />}
        Sign in
      </button>

      <div className="rounded-lg border border-line bg-bg px-3 py-2.5 text-xs text-ink-dim">
        Demo credentials — <span className="text-ink font-medium">sara@farman.dev</span> /{" "}
        <span className="text-ink font-mono">farman123</span>
      </div>
    </form>
  );
}
