"use client";

import { useDemo } from "@/lib/store";
import { getWorkflow, getStatusTone } from "@/lib/views";
import { workflows } from "@/lib/mock-data";
import { PageHeader, Row, StatusLabel } from "@/components/ui";
import Link from "next/link";

const stageLabels: Record<string, string> = {
  specify: "Specify",
  source: "Source",
  compare: "Compare",
  approve: "Approve",
  execute: "Execute",
  complete: "Complete",
};

export default function WorkflowsPage() {
  const { decision, jobs } = useDemo();
  return (
    <div>
      <PageHeader title="جریان‌های کاری" meta="هر کاری که فرمان در حال اجرا یا اجراشده دارد." />
      <div className="mb-8 text-sm text-neutral-500">
        یک جریان کار را باز کنید تا مراحل، اقدامات فرمان و نقاط ورود شما را ببینید.
      </div>
      {workflows.map((w) => {
        const view = getWorkflow(w.id, decision);
        const stage = stageLabels[view.currentStageId] ?? "";
        return (
          <Row
            key={w.id}
            href={`/workflows/${w.id}`}
            title={w.title}
            context={`${stage} stage · ${view.statusLine}`}
            right={<StatusLabel tone={getStatusTone(view.statusKind)}>{w.amount ? `${new Intl.NumberFormat("fa").format(w.amount)} ریال` : ""}</StatusLabel>}
          />
        );
      })}
      {jobs.length > 0 ? (
        <>
          <div className="mt-8 mb-2 text-sm text-neutral-400">ساخته‌شده از گفت‌وگو</div>
          {jobs.map((j) => (
            <Row
              key={j.id}
              href={`/workflows/${j.id}`}
              title={j.title}
              context={
                j.needsApproval
                  ? "پیش از آغاز این کار توسط فرمان، تأیید لازم است"
                  : "به دست هماهنگ‌کننده صف شد — مرحله مشخصات تعیین شد"
              }
              right={<StatusLabel tone={j.needsApproval ? "attention" : "neutral"}>برنامه‌ریزی‌شده</StatusLabel>}
            />
          ))}
        </>
      ) : null}
      <p className="mt-6 text-sm text-neutral-400">
        در جست‌وجوی درخواست خرید مشخصی هستید؟ بخش 
        <Link href="/procurement" className="text-brand underline hover:text-brand-hover">
          تدارکات
        </Link>
        را ببینید.
      </p>
    </div>
  );
}
