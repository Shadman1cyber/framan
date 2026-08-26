"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useDemo } from "@/lib/store";
import {
  getExecutionStepsFor,
  getWorkflow,
} from "@/lib/views";
import { purchaseOrder, purchaseRequest } from "@/lib/mock-data";
import type { Decision } from "@/lib/types";
import { money } from "@/lib/format";
import { ExecutionTimeline } from "@/components/timeline";
import { ProgressLine } from "@/components/charts";

export default function ExecutionPage({ params }: { params: { id: string } }) {
  const { decision } = useDemo();

  const isMain = params.id === "wf-1042";
  const steps = getExecutionStepsFor(params.id, decision);
  const wf = getWorkflow(params.id, decision);

  if (!isMain && steps.length === 0) {
    return (
      <EmptyState
        id={params.id}
        title="بدون داده — اجرا آغاز نشده است"
        body="این جریان کار هنوز به مرحلهٔ اجرا نرسیده است. خط زمان پس از صدور تأیید و آغاز اقدام فرمان همین‌جا نمایش داده می‌شود."
      />
    );
  }

  if (decision === "rejected" && isMain) {
    return (
      <div>
        <Header />
        <div className="rounded-md border-l-2 border-red-600 bg-red-50 p-4 text-sm leading-relaxed">
          چیزی برای اجرا نیست — شما پیشنهاد را رد کردید و فرمان پیش از ساخت سفارش خرید متوقف شد. چیزی ارسال نشد و هزینه‌ای در کار نیست.
          <div className="mt-2">
            <Link href="/workflows/wf-1042" className="underline">
              بازگشت به جریان کار
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const done = steps.filter((s) => s.state === "done").length;
  const summary = isMain ? mainSummary(decision, done) : wf.statusLine;

  return (
    <div>
      <Header />

      <p className="mb-4 text-sm text-neutral-700">{summary}</p>

      {isMain ? (
        <div className="mb-8">
          <ProgressLine
            done={steps.filter((st) => st.state === "done").length + (decision === "approved" ? 1 : 0)}
            total={6}
            caption={`${steps.filter((st) => st.state === "done").length} از ۶ گام اجرا تکمیل شده است`}
          />
        </div>
      ) : null}

      <section className="max-w-xl">
        <h2 className="mb-4 text-sm font-medium">خط زمان اجرا</h2>
        <ExecutionTimeline steps={steps} />
      </section>

      {isMain && decision === "approved" ? (
        <section className="mt-8 max-w-xl rounded-xl border-[0.5px] border-borders p-5">
          <h3 className="text-sm font-medium">سفارش خرید {purchaseOrder.id}</h3>
          <dl className="mt-2 space-y-1 text-sm text-neutral-600">
            <div className="flex justify-between gap-4">
              <dt>تأمین‌کننده</dt>
              <dd>{purchaseOrder.supplierName}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>مجموع</dt>
              <dd className="tnum">{money(purchaseOrder.amount)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>شرایط</dt>
              <dd>خالص ۳۰ روز · سررسید ۱ اکتبر</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>بازهٔ تحویل</dt>
              <dd>رسیدن ۲۲ سپتامبر</dd>
            </div>
          </dl>
        </section>
      ) : null}
    </div>
  );
}

function mainSummary(decision: Decision, done: number): string {
  if (decision === "approved")
    return `در حال پیشرفت — ${done + 1} از ۶ گام کامل است. به‌روزرسانی بعدی هنگام تأیید ${purchaseOrder.id} توسط پک‌لاین اینداستریز.`;
  if (decision === "change_requested")
    return "صف شده — عامل ارزیابی پیشنهاد را بازنگری می‌کند؛ اجرا پس از تأیید نسخهٔ اصلاح‌شده آغاز می‌شود.";
  if (decision === "evidence_requested")
    return "صف شده — فرمان شواهد بیشتر خواستهٔ شما را جمع می‌کند؛ اجرا پس از تصمیم شما آغاز می‌شود.";
  return "صف شده — هر شش گام آماده‌اند و به‌محض صدور تأیید خودکار اجرا می‌شوند.";
}

function Header() {
  return (
    <header className="mb-6">
      <Link
        href="/workflows/wf-1042"
        className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700"
      >
        <ArrowLeft size={12} /> جریان کار wf-1042
      </Link>
      <h1 className="mt-1 text-lg">مرحله اجرا — بسته‌بندی فصل چهارم</h1>
      <p className="mt-1 text-sm text-neutral-500">
        {purchaseRequest.quantity.toLocaleString()} pouches for {purchaseRequest.title.includes("kraft") ? "the Q4 launch" : ""}{" "}
        · needed by {purchaseRequest.neededBy}
      </p>
    </header>
  );
}

function EmptyState({ id, title, body }: { id: string; title: string; body: string }) {
  return (
    <div>
      <Link
        href={`/workflows/${id}`}
        className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700"
      >
        <ArrowLeft size={12} /> بازگشت به جریان کار
      </Link>
      <h1 className="mt-3 text-lg">{title}</h1>
      <p className="mt-1 max-w-lg text-sm leading-relaxed text-neutral-500">{body}</p>
    </div>
  );
}
