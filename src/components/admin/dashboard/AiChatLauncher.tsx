"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AiChatLocked, BotIcon, type AiLockedReason } from "./ai/AiChatLocked";
import { AiChatPanel } from "./ai/AiChatPanel";
import { DASHBOARD_HOME_HREF } from "@/lib/dashboard/modules";

/** Where the assistant already has a home, so the launcher would duplicate it. */
const ASSISTANT_ROUTES = [DASHBOARD_HOME_HREF, "/admin/ai", "/admin/workspace"];

/**
 * Floating assistant, mounted once in the admin panel layout so the manager can
 * reach the AI from any admin page — dashboard, module pages, the financial
 * report, sales flow and the legacy admin screens alike.
 *
 * It is hidden on the home screen, where the assistant already sits in a card.
 */
export function AiChatLauncher({ usable, reason }: { usable: boolean; reason?: AiLockedReason }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (ASSISTANT_ROUTES.includes(pathname)) return null;

  return (
    <>
      {open && (
        <div
          data-testid="ai-launcher-panel"
          role="dialog"
          aria-label="دستیار هوشمند"
          className="fixed inset-y-0 left-0 z-[60] flex w-[380px] max-w-[92vw] flex-col border-r border-dashboard-line bg-dashboard p-4 shadow-elevated"
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-dashboard-foreground">
              <span className="text-signal-bright" aria-hidden="true">
                <BotIcon />
              </span>
              <span className="truncate">دستیار هوشمند</span>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <Link href="/admin/ai" className="text-[12px] text-dashboard-muted transition-colors hover:text-dashboard-foreground">
                صفحه دستیار ←
              </Link>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="بستن دستیار"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-dashboard-line bg-dashboard-surface text-dashboard-muted transition-colors hover:border-dashboard-line-strong hover:text-dashboard-foreground"
              >
                <span aria-hidden="true" className="text-sm leading-none">✕</span>
              </button>
            </div>
          </div>
          {usable ? <AiChatPanel autoFocus /> : <AiChatLocked reason={reason ?? "disabled"} className="py-6" />}
        </div>
      )}
      <button
        type="button"
        data-testid="ai-launcher-toggle"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label="دستیار هوشمند"
        className="fixed bottom-5 left-5 z-[55] inline-flex h-12 w-12 items-center justify-center rounded-full border border-signal-bright/50 bg-signal-bright text-dashboard shadow-elevated transition-transform hover:scale-105 focus-visible:outline-none"
      >
        <span aria-hidden="true">
          <BotIcon size={20} />
        </span>
      </button>
    </>
  );
}
