import type { Decision, ExecutionStep, QueueItem, StatusKind, Workflow } from "./types";
import type { ChatJob } from "./store";
import {
  activityEvents,
  decisionEvents,
  mainWorkflowId,
  purchaseOrder,
  workflows,
} from "./mock-data";

export interface DemoState {
  decision: Decision;
}

export function getWorkflow(id: string, decision: Decision): Workflow {
  const base = workflows.find((w) => w.id === id);
  if (!base) return workflows[0];
  if (id !== mainWorkflowId) return base;

  const stages = base.stages.map((s) => ({ ...s }));

  if (decision === "approved") {
    const approve = stages.find((s) => s.id === "approve");
    const execute = stages.find((s) => s.id === "execute");
    if (approve) {
      approve.state = "completed";
      approve.completedAt = "Just now";
      delete approve.enteredAt;
    }
    if (execute) {
      execute.state = "active";
      execute.enteredAt = "just now";
    }
    return {
      ...base,
      stages,
      currentStageId: "execute",
      statusKind: "waiting_external",
      statusLine:
        "در حال اجرا — PO-5521 برای «پک‌لاین اینداستریز» ارسال شد. در انتظار تأییدیه تأمین‌کننده.",
    };
  }

  if (decision === "rejected") {
    const approve = stages.find((s) => s.id === "approve");
    if (approve) {
      approve.state = "blocked";
      delete approve.enteredAt;
    }
    return {
      ...base,
      stages,
      statusKind: "blocked",
      statusLine:
        "به تصمیم شما متوقف شد — هیچ سفارشی ثبت و هزینه‌ای نشد. تأمین‌کنندگان آگاه شدند.",
    };
  }

  if (decision === "change_requested") {
    return {
      ...base,
      statusKind: "running",
      statusLine:
        "در حال بازبینی پیشنهاد — پیش از تصمیم شما، زمان تحویل به‌روز از هر سه تأمین‌کننده گرفته می‌شود.",
    };
  }

  if (decision === "evidence_requested") {
    return {
      ...base,
      statusKind: "running",
      statusLine:
        "جمع‌آوری شواهد بیشتر — گواهی تحویل مراجع «سامیت فلکسیبل پکیجینگ» درخواست می‌شود.",
    };
  }

  return base;
}

export function getExecutionSteps(decision: Decision): ExecutionStep[] {
  if (decision === "rejected") return [];

  if (decision === "approved") {
    return [
      {
        key: "approved",
        label: "تأیید صادر شد",
        state: "done",
        detail: "به دست الکس چن — همین حالا ثبت شد.",
      },
      {
        key: "po-created",
        label: `ایجاد سفارش خرید — ${purchaseOrder.id}`,
        state: "done",
        detail: "از پیشنهاد پذیرفته‌شدهٔ پک‌لاین تنظیم شد (EV-110).",
      },
      {
        key: "po-sent",
        label: "ارسال به پک‌لاین اینداستریز",
        state: "done",
        detail: "تحویل‌شده به پرتال سفارش آن‌ها — رسید EV-131.",
      },
      {
        key: "confirmation",
        label: "تأییدیهٔ تأمین‌کننده",
        state: "waiting_external",
        detail: "در انتظار پاسخ تأمین‌کننده — سفارش چند لحظه پیش ارسال شد. پک‌لاین معمولاً تا ۴ ساعت کاری تأیید می‌کند.",
      },
      {
        key: "financial-update",
        label: "به‌روزرسانی مالی",
        state: "pending",
        detail: "پس از تأیید پک‌لاین، پرداخت «خالص ۳۰ روز» برای ۱ اکتبر زمان‌بندی می‌شود.",
      },
      {
        key: "complete",
        label: "تکمیل",
        state: "pending",
        detail: "با رسیدن کالا بسته می‌شود — موعد ۲۲ سپتامبر.",
      },
    ];
  }

  const queuedNote =
    decision === "change_requested"
      ? "صف شده — پس از تأیید پیشنهاد اصلاح‌شده اجرا می‌شود."
      : decision === "evidence_requested"
        ? "صف شده — پس از تصمیم شما با شواهد تازه اجرا می‌شود."
        : "تا صدور این تأیید در صف است.";

  return [
    {
      key: "approved",
      label: "Approval granted",
      state: "active",
      detail:
        decision === "pending"
          ? "در انتظار تأیید شما — ۶ دقیقه پیش وارد این مرحله شد."
          : queuedNote,
    },
    { key: "po-created", label: `ایجاد سفارش خرید — ${purchaseOrder.id}`, state: "pending", detail: queuedNote },
    { key: "po-sent", label: "ارسال به پک‌لاین اینداستریز", state: "pending", detail: queuedNote },
    { key: "confirmation", label: "تأییدیهٔ تأمین‌کننده", state: "pending", detail: queuedNote },
    { key: "financial-update", label: "به‌روزرسانی مالی", state: "pending", detail: queuedNote },
    { key: "complete", label: "تکمیل", state: "pending", detail: queuedNote },
  ];
}

export function getExecutionStepsFor(
  workflowId: string,
  decision: Decision,
): ExecutionStep[] {
  if (workflowId === mainWorkflowId) return getExecutionSteps(decision);

  if (workflowId === "wf-1038") {
    return [
      { key: "approved", label: "تأیید صادر شد", state: "done", detail: "پریا پتل — دیروز · ۱۷:۰۲." },
      { key: "po", label: "ایجاد سفارش خرید", state: "done", detail: "سفارش کارتی از حساب آنلاین کارگاه رست ثبت شد." },
      { key: "sent", label: "ارسال به تأمین‌کننده", state: "done", detail: "سفارش در سیستم تأمین‌کننده تأیید شد." },
      { key: "confirm", label: "تأییدیهٔ تأمین‌کننده", state: "done", detail: "بازهٔ تحویل دریافت شد — امروز پیش از ظهر." },
      { key: "fin", label: "به‌روزرسانی مالی", state: "done", detail: "۳٬۴۰۰٬۰۰۰ ریال هزینهٔ کارتی تسویه و مغایرت‌گیری شد (EV-090)." },
      { key: "complete", label: "تکمیل", state: "done", detail: "کالا در اتاق استراحت تحویل شد · امروز ۹:۴۱." },
    ];
  }

  if (workflowId === "wf-1044") {
    return [
      { key: "approved", label: "تأیید صادر شد", state: "done", detail: "سفارش دائمی — در چارچوب سیاست‌ها؛ نیازی به تأیید انسانی نبود." },
      { key: "po", label: "ایجاد سفارش خرید", state: "done", detail: "PO-5514 بر اساس قیمت قرارداد سفارش دائمی ایجاد شد." },
      { key: "sent", label: "ارسال به تأمین‌کننده", state: "done", detail: "تحویل به پرتال تأمین‌کننده · امروز · ۱۰:۰۲." },
      { key: "confirm", label: "تأییدیهٔ تأمین‌کننده", state: "done", detail: "Confirmed · Today · 10:47. Delivery scheduled Aug 26." },
      {
        key: "fin",
        label: "به‌روزرسانی مالی",
        state: "failed_retry",
        detail:
          "ناموفق — همگام‌سازی ERP ساعت ۱۱:۴۲ قطع شد (EV-150). تلاش مجدد هر ۴ دقیقه است؛ پس از سه شکست، فرمان به سام اورتز ارجاع می‌دهد.",
      },
      { key: "complete", label: "تکمیل", state: "pending", detail: "با رسیدن کالا در ۲۶ اوت و موفقیت ثبت دفتری بسته می‌شود." },
    ];
  }

  if (workflowId === "wf-1045") {
    return [
      { key: "approved", label: "تأیید صادر شد", state: "pending", detail: "صف شده — هنوز نرسیده؛ استعلام‌ها در حال جمع‌آوری است." },
      { key: "po", label: "Purchase order created", state: "pending", detail: "پس از تأیید یک پیشنهاد آغاز می‌شود." },
    ];
  }

  return [];
}

export function getStatusTone(kind: StatusKind): QueueItem["statusTone"] {  switch (kind) {
    case "needs_user":
      return "attention";
    case "completed":
      return "good";
    case "blocked":
    case "failed":
      return "bad";
    default:
      return "neutral";
  }
}

export function needsYou(decision: Decision, jobs: ChatJob[] = []): QueueItem[] {
  const items: QueueItem[] = [];
  for (const job of jobs) {
    if (job.needsApproval) {
      items.push({
        workflowId: job.id,
        title: `${job.title} — تأیید لازم است`,
        context:
          job.policyNote ??
          "از گفت‌وگوی شما ساخته شد — فرمان پیش از آغاز، منتظر امضاست",
        statusLabel: "نیازمند تأیید",
        statusTone: "attention",
        amount: job.amount,
        needsYou: true,
      });
    }
  }
  if (decision === "pending" || decision === "change_requested" || decision === "evidence_requested") {
    items.push({
      workflowId: "wf-1042",
      title: "بسته‌بندی فصل چهارم — نیازمند تأیید",
      context:
        decision === "pending"
          ? "عامل ارزیابی «پک‌لاین اینداستریز» را به مبلغ ۱۵۵٬۰۰۰٬۰۰۰ ریال پیشنهاد می‌کند — سیاست POL-2 امضای شما را می‌خواهد"
          : decision === "change_requested"
            ? "عامل ارزیابی پیشنهاد را با زمان‌های تحویل به‌روز بازنگری می‌کند — بررسی شما پس از بازگشت ادامه می‌یابد"
            : "عامل تأمین گواهی‌های تحویل سامیت فلکسیبل پکیجینگ را جمع می‌کند — بررسی شما به‌زودی ادامه می‌یابد",
      statusLabel: decision === "pending" ? "نیازمند تأیید" : "در حال بازنگری",
      statusTone: "attention",
      amount: 155000000,
      needsYou: true,
    });
  }
  if (decision !== "approved") {
    items.push({
      workflowId: "wf-1041",
      title: "چاپ مجدد کارت ویزیت — تأیید منقضی شد",
      context: "طی ۴۸ ساعت تصمیمی گرفته نشد؛ فرمان فردا ساعت ۹:۰۰ دوباره ارسال می‌کند مگر اکنون تصمیم بگیرید",
      statusLabel: "منقضی",
      statusTone: "bad",
      amount: 410,
      needsYou: true,
    });
  }
  return items;
}

export function runningItems(decision: Decision, jobs: ChatJob[] = []): QueueItem[] {
  const items: QueueItem[] = [];
  for (const job of jobs) {
    if (!job.needsApproval) {
      items.push({
        workflowId: job.id,
        title: job.title,
        context: "به دست هماهنگ‌کننده از گفت‌وگوی شما صف شد — مرحله مشخصات تعیین شد",
        statusLabel: "در صف",
        statusTone: "neutral",
        amount: job.amount,
        needsYou: false,
      });
    }
  }
  if (decision === "approved") {
    items.push({
      workflowId: "wf-1042",
      title: "بسته‌بندی فصل چهارم — در حال اجرا",
      context:
        "عامل تأمین PO-5521 را برای پک‌لاین اینداستریز فرستاد — در انتظار تأییدیهٔ تأمین‌کننده",
      statusLabel: "با تأمین‌کننده",
      statusTone: "neutral",
      amount: 155000000,
      needsYou: false,
    });
  }
  items.push(
    {
      workflowId: "wf-1045",
      title: "سفارش مجدد دستکش ایمنی",
      context:
        "عامل تأمین — استعلام ۲۶ دقیقه پیش به ۳ تأمین‌کننده رفت؛ مهلت پاسخ ۱۷:۰۰",
      statusLabel: "با تأمین‌کنندگان",
      statusTone: "neutral",
      amount: 980,
      needsYou: false,
    },
    {
      workflowId: "wf-1044",
      title: "خرید ملزومات نظافتی",
      context:
        "عامل مالی — هنگام ثبت ذخیره، همگام‌سازی ERP خطا دارد؛ تلاش هر ۴ دقیقه",
      statusLabel: "تلاش مجدد",
      statusTone: "bad",
      amount: 1150,
      needsYou: false,
    },
    {
      workflowId: "wf-1040",
      title: "چاپگر برچسب انبار",
      context: "متوقف با POL-7 — استعلام دوم ساعت ۱۰:۱۵ خواسته شد؛ در انتظار فروشنده",
      statusLabel: "متوقف",
      statusTone: "bad",
      amount: 2300,
      needsYou: false,
    },
  );
  return items;
}

export function completedToday(decision: Decision): QueueItem[] {
  const items: QueueItem[] = [
    {
      workflowId: "wf-1038",
      title: "خرید دانه قهوه اتاق استراحت",
      context: "عامل مالی پرداخت کارتی را تسویه و رسید را الصاق کرد",
      statusLabel: "تکمیل · ۹:۴۱",
      statusTone: "good",
      amount: 340,
      needsYou: false,
    },
  ];
  if (decision === "rejected") {
    items.unshift({
      workflowId: "wf-1042",
      title: "بسته‌بندی فصل چهارم — بدون خرید بسته شد",
      context: "شما پیشنهاد را رد کردید؛ تأمین‌کنندگان از پایان کار آگاه شدند",
      statusLabel: "بسته‌شده",
      statusTone: "neutral",
      amount: 0,
      needsYou: false,
    });
  }
  return items;
}

export function getActivityFeed(decision: Decision) {
  const extra = decisionEvents[decision];
  if (!extra) return activityEvents;
  const appended = extra.events.map((e, i) => ({
    ...e,
    seq: extra.seqBase + i,
    id: `act-d${i + 1}`,
  }));
  return [...appended, ...activityEvents].sort((a, b) => b.seq - a.seq);
}
