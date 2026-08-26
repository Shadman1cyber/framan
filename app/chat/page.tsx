"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { useDemo } from "@/lib/store";

interface DispatchItem {
  agent: string;
  instruction: string;
}

interface LinkItem {
  href: string;
  label: string;
}

interface Turn {
  id: number;
  role: "user" | "orch" | "error";
  text?: string;
  dispatch?: DispatchItem[];
  links?: LinkItem[];
  jobLink?: LinkItem;
}

const LINK_ROUTES: Record<string, string> = {
  approval: "/approvals/apr-1042",
  compare: "/workflows/wf-1042/compare",
  execution: "/workflows/wf-1042/execution",
  workflow: "/workflows/wf-1042",
  audit: "/activity",
  finance: "/finance",
  tasks: "/tasks",
};

const DEFAULT_LABELS: Record<string, string> = {
  approval: "Open the approval",
  compare: "See the offer comparison",
  execution: "Follow execution",
  workflow: "Open the workflow",
  audit: "Open the audit log",
  finance: "See finances",
  tasks: "Open my tasks",
};

const SUGGESTIONS = [
  "وضعیت سفارش بسته‌بندی فصل چهارم چیست؟",
  "۲۰۰ بسته شیر گیاهی برای کافه تأمین کن",
  "آیا خرید بسته‌بندی الان مقرون‌به‌صرفه است؟",
];

let turnId = 0;

export default function ChatPage() {
  const { addJob, user } = useDemo();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [waiting, setWaiting] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  function scrollToBottom() {
    requestAnimationFrame(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    });
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || waiting) return;
    setInput("");

    const nextHistory = [...turns, { id: ++turnId, role: "user" as const, text: trimmed }];
    setTurns(nextHistory);
    setWaiting(true);
    scrollToBottom();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userName: user?.name ?? "",
          userTitle: user?.title ?? "",
          messages: nextHistory.map((t) => ({
            // Assistant turns are sent as their JSON form so the model keeps
            // answering in the structured protocol instead of drifting to prose.
            role: t.role === "user" ? "user" : "assistant",
            content:
              t.role === "user"
                ? (t.text ?? "")
                : JSON.stringify({ reply: t.text ?? "" }),
          })),
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        reply?: string;
        dispatch?: DispatchItem[];
        actions?: Array<{
          type: string;
          target?: string;
          label?: string;
          title?: string;
          stages?: string[];
          needs_approval?: boolean;
          amount?: number;
          policy_note?: string;
        }>;
      };

      if (!data.ok) {
        setTurns((prev) => [
          ...prev,
          { id: ++turnId, role: "error", text: data.error },
        ]);
      } else {
        const links: LinkItem[] = [];
        let jobLink: LinkItem | undefined;

        for (const a of data.actions ?? []) {
          if (a.type === "link" && a.target && LINK_ROUTES[a.target]) {
            links.push({
              href: LINK_ROUTES[a.target],
              label: a.label ?? DEFAULT_LABELS[a.target] ?? "Open",
            });
          }
          if (
            a.type === "create_job" &&
            a.title &&
            Array.isArray(a.stages) &&
            a.stages.length > 0
          ) {
            const id = addJob({
              title: a.title,
              stages: a.stages,
              needsApproval: Boolean(a.needs_approval),
              amount: a.amount,
              policyNote: a.policy_note,
            });
            jobLink = {
              href: `/workflows/${id}`,
              label: `View “${a.title}”`,
            };
          }
        }

        setTurns((prev) => [
          ...prev,
          {
            id: ++turnId,
            role: "orch",
            text: data.reply,
            dispatch: data.dispatch,
            links,
            jobLink,
          },
        ]);
      }
    } catch {
      setTurns((prev) => [
        ...prev,
        {
          id: ++turnId,
          role: "error",
          text: "The orchestrator could not be reached — check that the dev server is running and try again.",
        },
      ]);
    } finally {
      setWaiting(false);
      scrollToBottom();
    }
  }

  return (
    <div className="flex flex-col">
      <header className="mb-5">
        <h1 className="text-lg">گفت‌وگو</h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-neutral-500">
          آنچه می‌خواهید را با زبان خودتان بگویید. هماهنگ‌کننده تصمیم می‌گیرد کدام عامل‌ها چه کنند، کارها را تقسیم می‌کند و صفحه‌هایی را که برای بازبینی یا تأیید لازم دارید پیش روی شما می‌گذارد.
        </p>
      </header>

      <div ref={listRef} className="min-h-[45vh] space-y-4">
        {turns.length === 0 ? (
          <div className="rounded-xl border-[0.5px] border-borders p-5">
            <div className="text-sm">یکی از این‌ها را امتحان کنید</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => void send(s)}
                  className="rounded-md border-[0.5px] border-borders bg-surface px-3 py-1.5 text-left text-sm hover:bg-white"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {turns.map((t) =>
          t.role === "user" ? (
            <div key={t.id} className="flex justify-end">
              <div className="max-w-[85%] rounded-xl bg-neutral-900 px-4 py-3 text-sm leading-relaxed text-white sm:max-w-[70%]">
                {t.text}
              </div>
            </div>
          ) : t.role === "error" ? (
            <div key={t.id}>
              <ActorLine />
              <div className="mt-1 max-w-full rounded-xl border-l-2 border-red-600 bg-red-50 px-4 py-3 text-sm leading-relaxed text-neutral-700">
                {t.text}
              </div>
            </div>
          ) : (
            <div key={t.id}>
              <ActorLine />
              <div className="mt-1 max-w-full rounded-xl border-[0.5px] border-borders px-4 py-3">
                <p className="text-sm leading-relaxed">{t.text}</p>

                {t.dispatch && t.dispatch.length > 0 ? (
                  <div className="mt-3 space-y-[0.5px]">
                    {t.dispatch.map((d, i) => (
                      <div
                        key={i}
                        className="border-s-2 border-brand-mid bg-brand-soft/50 px-3 py-2"
                      >
                        <span className="text-xs text-neutral-400">واگذارشده</span>{" "}
                        <span className="text-sm font-medium">{d.agent}</span>
                        <span className="block text-sm text-neutral-600">{d.instruction}</span>
                      </div>
                    ))}
                  </div>
                ) : null}

                {t.jobLink ? (
                  <Link
                    href={t.jobLink.href}
                    className="mt-3 inline-flex items-center gap-1 rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-hover"
                  >
                    {t.jobLink.label} <ArrowRight size={12} />
                  </Link>
                ) : null}

                {t.links && t.links.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {t.links.map((l) => (
                      <Link
                        key={l.href}
                        href={l.href}
                        className="inline-flex items-center gap-1 rounded-md border-[0.5px] border-borders px-3 py-1.5 text-sm hover:bg-surface"
                      >
                        {l.label} <ArrowUpRight size={12} />
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ),
        )}

        {waiting ? (
          <div>
            <ActorLine />
            <div className="mt-1 rounded-xl border-l-2 border-borders bg-surface px-4 py-3 text-sm text-neutral-600">
              هماهنگ‌کننده در حال خواندن درخواست شما و واگذاری کار به عامل‌ها است — معمولاً چند ثانیه طول می‌کشد.
            </div>
          </div>
        ) : null}
      </div>

      <form
        className="sticky bottom-4 mt-6 rounded-xl border-[0.5px] border-borders bg-white p-1.5 shadow-none"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <div className="flex items-end gap-2 px-3 py-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            rows={Math.min(3, Math.max(1, Math.ceil(input.length / 60)))}
            placeholder="بگویید چه می‌خواهید — مثلاً «تا جمعه ۲۰۰ بسته شیر گیاهی تأمین شود»"
            className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-neutral-400"
            aria-label="به هماهنگ‌کننده بگویید چه می‌خواهید"
            maxLength={500}
            disabled={waiting}
          />
          <button
            type="submit"
            disabled={!input.trim() || waiting}
            aria-label="ارسال"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ArrowRight size={14} />
          </button>
        </div>
      </form>
      <p className="mt-2 text-sm text-neutral-400">
        هماهنگ‌کننده در چارچوب سیاست کار می‌کند: هر چیزی بالای ۱۰۰٬۰۰۰٬۰۰۰ ریال پیش از اجرا برای تأیید مدیریتی می‌ایستد.
      </p>
    </div>
  );
}

function ActorLine() {
  return (
    <div className="px-1 text-xs text-neutral-400">
      هماهنگ‌کننده · فرمان
    </div>
  );
}
