"use client";

import Link from "next/link";
import { AiChatLocked, BotIcon, type AiLockedReason } from "./ai/AiChatLocked";
import { AiChatPanel } from "./ai/AiChatPanel";

/**
 * The assistant, embedded in the dashboard home screen.
 *
 * `usable` is decided on the server: when the assistant is switched off, has no
 * provider key, or the signed-in role may not use it, the card shows a locked
 * state with a link to the settings page instead of an input that cannot work.
 */
export function AiChatCard({ usable, reason }: { usable: boolean; reason?: AiLockedReason }) {
  return (
    <section data-testid="ai-chat-card" className="mt-3 flex min-h-[230px] flex-col rounded-[14px] border border-dashboard-line bg-dashboard-surface/75 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-dashboard-foreground">
          <span className="text-signal-bright" aria-hidden="true">
            <BotIcon />
          </span>
          <span className="truncate">دستیار هوشمند</span>
        </div>
        <Link href="/admin/ai" className="shrink-0 text-[12px] text-dashboard-muted transition-colors hover:text-dashboard-foreground">
          صفحه دستیار ←
        </Link>
      </div>
      {usable ? <AiChatPanel /> : <AiChatLocked reason={reason ?? "disabled"} />}
    </section>
  );
}
