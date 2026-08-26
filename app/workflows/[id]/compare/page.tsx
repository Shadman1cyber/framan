"use client";

import Link from "next/link";
import { Check, Minus } from "lucide-react";
import { useDemo } from "@/lib/store";
import {
  offers,
  policies,
  purchaseRequest,
  recommendation,
  rfq,
  suppliers as supplierRecords,
} from "@/lib/mock-data";
import type { Decision, Offer } from "@/lib/types";
import { money } from "@/lib/format";
import { BarList } from "@/components/charts";

const recommended = offers.find((o) => o.id === recommendation.offerId) as Offer;
const recommendedId = recommended.id;
const others = offers.filter((o) => o.id !== recommendedId);

export default function ComparePage() {
  const { decision } = useDemo();

  return (
    <div>
      <header className="mb-6">
        <div className="text-sm text-neutral-500">
          <Link href="/workflows/wf-1042" className="hover:text-neutral-700">
            جریان کار wf-1042
          </Link>{" "}
          · مرحله مقایسه
        </div>
        <h1 className="mt-1 text-lg">{purchaseRequest.title}</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {rfq.responsesReceived} از ۳ پیشنهاد دریافت شد · موجودی لازم تا{" "}
          {purchaseRequest.neededBy}
        </p>
      </header>

      <DecisionNote decision={decision} />

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-medium">مقایسه پیشنهادها</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="w-40 border-[0.5px] border-borders bg-surface px-4 py-3 text-left font-medium text-neutral-500">
                  عامل
                </th>
                {offers.map((o) => {
                  const isRec = o.id === recommendedId;
                  return (
                    <th
                      key={o.id}
                      className={`border-[0.5px] border-borders px-4 py-3 text-left align-top ${
                        isRec ? "bg-surface" : ""
                      }`}
                    >
                      <div>{supplierName(o)}</div>
                      <div
                        className={`mt-0.5 text-xs ${isRec ? "font-medium" : "text-neutral-400"}`}
                      >
                        {isRec
                          ? decision === "rejected"
                            ? "پیشنهاد قبلی"
                            : "پیشنهاد فرمان"
                          : `دریافت ${o.receivedAt}`}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              <FactorRow
                label="قیمت"
                render={(o) => (
                  <>
                    <span className="tnum">{money(o.total)}</span>
                    <span className="mt-0.5 block text-xs text-neutral-500">
                      {money(o.unitPrice)} per unit × 50,000
                    </span>
                  </>
                )}
                noteFor={priceNote}
              />
              <FactorRow
                label="زمان تحویل"
                render={(o) => (
                  <>
                    <span>{o.arrivalLabel}</span>
                    <span className="mt-0.5 flex items-center gap-1 text-xs">
                      {o.meetsDeadline ? (
                        <span className="flex items-center gap-1 text-green-700">
                          <Check size={12} /> مهلت شما را برآورده می‌کند
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-red-700">
                          <Minus size={12} /> از مهلت می‌گذرد
                        </span>
                      )}
                    </span>
                  </>
                )}
              />
              <FactorRow
                label="قابلیت اطمینان"
                render={(o) => (
                  <>
                    <span>{o.reliabilityDisplay}</span>
                    {o.reliabilityConfidence === "unproven" ? (
                      <span className="mt-0.5 block text-xs text-amber-700">
                        شواهد ناکافی — تأمین‌کننده جدید؛ هنوز مبنایی برای سنجش نیست
                      </span>
                    ) : null}
                    {o.reliabilityConfidence === "low" ? (
                      <span className="mt-0.5 block text-xs text-neutral-500">
                        اطمینان کم — بر پایه تنها ۶ سفارش اخیر
                      </span>
                    ) : null}
                  </>
                )}
              />
              <FactorRow
                label="شرایط پرداخت"
                render={(o) => (
                  <>
                    <span>{o.paymentTerms}</span>
                    {o.paymentTermsNote ? (
                      <span className="mt-0.5 block text-xs text-green-700">
                        {o.paymentTermsNote}
                      </span>
                    ) : null}
                  </>
                )}
              />
              <FactorRow
                label="بررسی سیاست"
                render={(o) =>
                  o.policyCheck.state === "pass" ? (
                    <span className="flex items-center gap-1 text-green-700">
                      <Check size={12} /> قبول
                      <span className="text-xs text-neutral-500">
                        ({policyName(o.policyCheck.policyCode)})
                      </span>
                    </span>
                  ) : (
                    <>
                      <span className="text-amber-700">نشان‌گذاری‌شده</span>
                      <span className="mt-0.5 block text-xs text-neutral-600">
                        {o.policyCheck.note}
                      </span>
                    </>
                  )
                }
              />
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-1 text-sm font-medium">نمای تصویری</h2>
        <p className="mb-5 text-sm text-neutral-500">
          طول هر نوار، مقدار همان عامل است؛ ستون تیره پیشنهاد فرمان است.
        </p>
        <div className="grid gap-8 sm:grid-cols-3">
          <div>
            <div className="mb-3 text-xs text-neutral-400">مجموع قیمت (ریال)</div>
            <BarList
              items={offers.map((o) => ({
                key: o.id,
                label: supplierName(o),
                value: o.total,
                display: money(o.total),
                tone:
                  o.id === recommendedId
                    ? decision === "rejected"
                      ? "muted"
                      : "primary"
                    : o.meetsDeadline
                      ? "muted"
                      : "bad",
              }))}
            />
          </div>
          <div>
            <div className="mb-3 text-xs text-neutral-400">زمان تحویل (روز)</div>
            <BarList
              items={offers.map((o) => ({
                key: o.id,
                label: supplierName(o),
                value: o.leadTimeDays,
                display: `${o.leadTimeDays} روز`,
                tone: o.meetsDeadline ? (o.id === recommendedId ? "primary" : "muted") : "bad",
                note: o.meetsDeadline ? undefined : "از مهلت ۲۸ سپتامبر می‌گذرد",
              }))}
            />
          </div>
          <div>
            <div className="mb-3 text-xs text-neutral-400">تحویل به‌موقع</div>
            <BarList
              items={offers.map((o) => ({
                key: o.id,
                label: supplierName(o),
                value: o.onTimeRate ?? 0,
                display: o.reliabilityDisplay,
                tone: o.reliabilityConfidence === "unproven" ? "bad" : o.id === recommendedId ? "good" : "muted",
                note: o.reliabilityConfidence === "unproven" ? "بدون سابقه برای سنجش" : undefined,
              }))}
            />
          </div>
        </div>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-sm font-medium">چرا سایر گزینه‌ها انتخاب نشدند</h2>
        {others.map((o) => (
          <div key={o.id} className="rounded-md border-[0.5px] border-borders p-4">
            <div className="text-sm">{supplierName(o)}</div>
            <p className="mt-1 text-sm leading-relaxed text-neutral-600">
              {recommendation.notPickedNotes[o.supplierId]}
            </p>
          </div>
        ))}
      </section>

      <NextStepCard decision={decision} />
    </div>
  );
}

function FactorRow({
  label,
  render,
  noteFor,
}: {
  label: string;
  render: (offer: Offer) => React.ReactNode;
  noteFor?: (offer: Offer) => React.ReactNode;
}) {
  return (
    <tr>
      <td className="border-[0.5px] border-borders bg-surface px-4 py-3 align-top text-neutral-500">
        {label}
      </td>
      {offers.map((o) => (
        <td key={o.id} className="border-[0.5px] border-borders px-4 py-3 align-top">
          {render(o)}
          {noteFor ? (
            <span className="mt-1 block text-xs text-neutral-500">{noteFor(o)}</span>
          ) : null}
        </td>
      ))}
    </tr>
  );
}

function DecisionNote({ decision }: { decision: Decision }) {
  if (decision === "approved") {
    return (
      <Note tone="good">
        تأیید شد — «پک‌لاین اینداستریز» به مبلغ {money(recommended.total)} انتخاب شد. سفارش در حال اجراست؛ این مقایسه به‌عنوان سابقهٔ گزینه‌های بررسی‌شده نگه داشته می‌شود.
      </Note>
    );
  }
  if (decision === "rejected") {
    return (
      <Note tone="danger">
        بدون خرید بسته شد — شما پیشنهاد را رد کردید. هر سه پیشنهاد به همان شکل لحظهٔ تصمیم نمایش داده می‌شوند.
      </Note>
    );
  }
  if (decision === "change_requested") {
    return (
      <Note tone="info">
        شما اصلاح خواستید — عامل ارزیابی زمان تحویل به‌روز را از هر سه تأمین‌کننده می‌گیرد. این جدول با بازگشت پیشنهاد اصلاح‌شده به‌روز می‌شود.
      </Note>
    );
  }
  if (decision === "evidence_requested") {
    return (
      <Note tone="info">
        شواهد بیشتر خواستید — فرمان گواهی تحویل به‌موقع مراجع «سامیت فلکسیبل پکیجینگ» را می‌گیرد و همین‌جا اضافه می‌کند.
      </Note>
    );
  }
  return <Note tone="info">{recommendation.because}</Note>;
}

function NextStepCard({ decision }: { decision: Decision }) {
  if (decision !== "pending") return null;
  return (
    <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-xl border-[0.5px] border-borders p-5">
      <div>
        <div className="text-sm">گام بعد: تأیید</div>
        <p className="mt-1 text-sm text-neutral-500">
          سیاست POL-2 پیش از اجرا، امضای مدیر را برای بالای ۱۰۰٬۰۰۰٬۰۰۰ ریال لازم می‌داند.
        </p>
      </div>
      <Link
        href="/approvals/apr-1042"
        className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover"
      >
        بررسی تأیید
      </Link>
    </div>
  );
}

function Note({
  tone,
  children,
}: {
  tone: "good" | "danger" | "info";
  children: React.ReactNode;
}) {
  const styles =
    tone === "good"
      ? "border-green-600 bg-green-50"
      : tone === "danger"
        ? "border-red-600 bg-red-50"
        : "border-brand/40 bg-brand-soft/60";
  return (
    <div className={`rounded-md border-l-2 ${styles} p-4 text-sm leading-relaxed`}>
      {children}
    </div>
  );
}

function supplierName(offer: Offer): string {
  return supplierRecords.find((s) => s.id === offer.supplierId)?.name ?? "";
}

function policyName(code: string): string {
  return policies.find((p) => p.code === code)?.name ?? code;
}

function priceNote(offer: Offer): string {
  const delta = offer.total - recommended.total;
  if (delta === 0) return "کم‌ترین قیمت میان گزینه‌های دارای مهلت";
  const dir = delta < 0 ? "ارزان‌تر" : "گران‌تر";
  const base = `${money(Math.abs(delta))} ${dir} نسبت به پیشنهاد فرمان`;
  if (!offer.meetsDeadline) return `${base} — اما مهلت ۲۸ سپتامبر را از دست می‌دهد`;
  return base;
}
