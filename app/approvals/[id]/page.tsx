"use client";

import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { useDemo } from "@/lib/store";
import {
  approval,
  budgetCategories,
  company,
  offers,
  purchaseRequest,
  recommendation,
  suppliers as supplierRecords,
} from "@/lib/mock-data";
import type { Decision, Offer } from "@/lib/types";
import { money, signedMoney } from "@/lib/format";
import { Btn, EvidenceChip, MetricGroup, Metric } from "@/components/ui";

const recommendedId = recommendation.offerId;

export default function ApprovalPage({ params }: { params: { id: string } }) {
  const { decision, decide, reset, user } = useDemo();

  const canDecide =
    !!user &&
    (user.roleId === "role-director" ||
      user.roleId === "role-finance-partner" ||
      user.id === "u-alex");

  if (params.id !== approval.id) {
    return (
      <p className="text-sm text-neutral-500">
        Unknown approval reference. Open{" "}
        <Link href="/tasks" className="underline">
          My tasks
        </Link>{" "}
        to see what needs you.
      </p>
    );
  }

  const packaging = budgetCategories.find((c) => c.id === "cat-packaging");
  const remaining = packaging ? packaging.monthlyCap - packaging.committed : 0;
  const remainingAfter = remaining - approval.amount;
  const recommendedOffer = offers.find((o) => o.id === recommendedId) as Offer;

  return (
    <div>
      <header className="mb-6">
        <div className="text-sm text-neutral-500">
          <Link href="/workflows/wf-1042" className="hover:text-neutral-700">
            Workflow wf-1042
          </Link>{" "}
          · Approve stage
        </div>
        <h1 className="mt-1 text-lg">Approval decision</h1>
        <p className="mt-1 text-sm text-neutral-500">
          درخواست {approval.requestedAt} · واگذارشده به {approval.assignedToName} ·{" "}
          {approval.expiresIn}
        </p>
      </header>

      {/* The approval card */}
      <div className="rounded-xl border-[0.5px] border-borders p-6 sm:p-8">
        {/* 1 — what am I approving + 2 — how much */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <Label>چه چیزی را تأیید می‌کنید</Label>
            <h2 className="mt-1 text-base">پرداخت به پک‌لاین اینداستریز</h2>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-neutral-600">
              {purchaseRequest.quantity.toLocaleString()} kraft stand-up pouches for the Q4 launch,
              delivered by {purchaseRequest.neededBy}.
            </p>
          </div>
          <div className="text-right">
            <Label>مبلغ سفارش</Label>
            <div className="tnum mt-1 text-3xl">{money(approval.amount)}</div>
            <div className="tnum mt-0.5 text-sm text-neutral-500">
              {money(recommendedOffer.unitPrice)} به ازای هر واحد
            </div>
          </div>
        </div>

        {/* 3 — why this option: factor table, no bare scores */}
        <div className="mt-7">
          <Label>چرا این گزینه</Label>
          <p className="mt-1 text-sm leading-relaxed text-neutral-600">
            فرمان «پک‌لاین اینداستریز» را پیشنهاد می‌کند، زیرا کم‌هزینه‌ترین پیشنهادِ برآورده‌کنندهٔ مهلت ۲۸ سپتامبر است و بهترین سابقهٔ تحویل را دارد.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr>
                  <th className="w-28 border-[0.5px] border-borders bg-surface px-3 py-2 text-left font-medium text-neutral-500">
                    عامل
                  </th>
                  <th className="border-[0.5px] border-borders bg-surface px-3 py-2 text-left align-top">
                    <div>Packline Industries</div>
                    <div className="text-xs font-medium">
                      {decision === "rejected" ? "پیشنهاد قبلی" : "پیشنهاد فرمان"}
                    </div>
                  </th>
                  {offers
                    .filter((o) => o.id !== recommendedId)
                    .map((o) => (
                      <th
                        key={o.id}
                        className="border-[0.5px] border-borders px-3 py-2 text-left align-top font-medium"
                      >
                        {supplierName(o)}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border-[0.5px] border-borders px-3 py-2 align-top text-neutral-500">
                    قیمت
                  </td>
                  <td className="border-[0.5px] border-borders px-3 py-2 align-top">
                    <span className="tnum">IRR 155,000,000</span>
                    <span className="block text-xs text-neutral-500">
                      کم‌ترین میان گزینه‌های دارای مهلت
                    </span>
                  </td>
                  <td className="border-[0.5px] border-borders px-3 py-2 align-top">
                    <span className="tnum">IRR 130,000,000</span>
                    <span className="block text-xs text-neutral-500">
                      ارزان‌تر، اما از مهلت می‌گذرد
                    </span>
                  </td>
                  <td className="border-[0.5px] border-borders px-3 py-2 align-top">
                    <span className="tnum">IRR 180,000,000</span>
                    <span className="block text-xs text-neutral-500">
                      ۲۵٬۰۰۰٬۰۰۰ ریال (۱۶٪) بیشتر از پیشنهاد فرمان
                    </span>
                  </td>
                </tr>
                <tr>
                  <td className="border-[0.5px] border-borders px-3 py-2 align-top text-neutral-500">
                    زمان تحویل
                  </td>
                  <td className="border-[0.5px] border-borders px-3 py-2 align-top">
                    ۲۱ روز — رسیدن ۲۲ سپتامبر
                    <span className="block text-xs text-green-700">
                      مهلت ۲۸ سپتامبر با ۶ روز ذخیره
                    </span>
                  </td>
                  <td className="border-[0.5px] border-borders px-3 py-2 align-top">
                    ۳۵ روز — رسیدن ۶ اکتبر
                    <span className="block text-xs text-red-700">از مهلت می‌گذرد</span>
                  </td>
                  <td className="border-[0.5px] border-borders px-3 py-2 align-top">
                    ۱۲ روز — رسیدن ۱۳ سپتامبر
                    <span className="block text-xs text-green-700">مهلت را برآورده می‌کند</span>
                  </td>
                </tr>
                <tr>
                  <td className="border-[0.5px] border-borders px-3 py-2 align-top text-neutral-500">
                    قابلیت اطمینان
                  </td>
                  <td className="border-[0.5px] border-borders px-3 py-2 align-top">
                    ۹۸٪ به‌موقع در ۲۴ سفارش
                  </td>
                  <td className="border-[0.5px] border-borders px-3 py-2 align-top">
                    بدون سابقهٔ تحویل
                    <span className="block text-xs text-amber-700">
                      شواهد ناکافی — تأمین‌کننده جدید
                    </span>
                  </td>
                  <td className="border-[0.5px] border-borders px-3 py-2 align-top">
                    ۸۹٪ به‌موقع در ۶ سفارش اخیر
                    <span className="block text-xs text-neutral-500">
                      ۳ تحویل دیرهنگام — ریسک زمانی
                    </span>
                  </td>
                </tr>
                <tr>
                  <td className="border-[0.5px] border-borders px-3 py-2 align-top text-neutral-500">
                    شرایط پرداخت
                  </td>
                  <td className="border-[0.5px] border-borders px-3 py-2 align-top">
                    خالص ۳۰ روز
                    <span className="block text-xs text-neutral-500">استاندارد طبق POL-8</span>
                  </td>
                  <td className="border-[0.5px] border-borders px-3 py-2 align-top">
                    خالص ۴۵ روز
                    <span className="block text-xs text-neutral-500">
                      خارج از شرایط استاندارد
                    </span>
                  </td>
                  <td className="border-[0.5px] border-borders px-3 py-2 align-top">
                    خالص ۳۰ روز با تخفیف ۲٪/۱۰
                    <span className="block text-xs text-green-700">
                      تخفیف زودهنگام مطابق POL-8
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* 4 — risk/policy trigger */}
        <div className="mt-7">
          <Label>چرا این کار با شماست</Label>
          <div className="mt-2 rounded-md border-l-2 border-amber-600 bg-amber-50 p-4 text-sm leading-relaxed">
            {approval.requiredBecause}
          </div>
        </div>

        {/* 5 — what happens if approved */}
        <div className="mt-7">
          <Label>در صورت تأیید</Label>
          <p className="mt-1 text-sm leading-relaxed text-neutral-700">{approval.ifApproved}</p>
        </div>

        {/* Finance impact — inline, phase 7 */}
        <div className="mt-7">
          <Label>بستر مالی</Label>
          <div className="mt-2">
            <MetricGroup>
              <Metric label="موجودی نقد امروز" value={money(company.cashPosition)} />
              <Metric
                label="این تراکنش"
                value={signedMoney(-approval.amount)}
                note="سررسید ۱ اکتبر، خالص ۳۰ روز"
              />
              <Metric
                label="باقیماندهٔ بودجه بسته‌بندی"
                value={`${money(remaining)} → ${money(remainingAfter)}`}
                note={`از سقف ماهانهٔ ${money(packaging?.monthlyCap ?? 0)}`}
              />
            </MetricGroup>
            <p className="mt-3 text-sm leading-relaxed text-neutral-600">
              مقرون‌به‌صرفه است — پرداخت در ۱ اکتبر با شرایط خالص ۳۰ روز انجام می‌شود؛ موجودی نقد مثبت می‌مانَد و هزینهٔ بسته‌بندی داخل سقف ماهانه با {money(remainingAfter)} ذخیره می‌مانَد. بررسی توسط عامل مالی در ۱۱:۰۷ (EV-140).
            </p>
          </div>
        </div>

        {/* Decision */}
        <div className="mt-8 border-t-[0.5px] border-borders pt-6">
          {decision === "pending" ? (
            canDecide ? (
              <>
                <Label>تصمیم شما</Label>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Btn variant="primary" onClick={() => decide("approved")}>
                    تأیید — ۱۵۵٬۰۰۰٬۰۰۰ ریال
                  </Btn>
                  <Btn onClick={() => decide("rejected")}>رد</Btn>
                  <Btn onClick={() => decide("change_requested")}>درخواست اصلاح</Btn>
                  <Btn onClick={() => decide("evidence_requested")}>
                    درخواست شواهد بیشتر
                  </Btn>
                </div>
                <p className="mt-3 text-sm text-neutral-500">
                  تصمیم شما همراه با شواهد بالا در گزارش حسابرسی ثبت می‌شود.
                </p>
              </>
            ) : (
              <div className="rounded-md border-l-2 border-borders bg-surface p-4 text-sm leading-relaxed text-neutral-600">
                این تصمیم به الکس چن (مدیر عملیات) واگذار شده است
                {user ? `، ${user.name}` : ""}
                . همه‌چیز را می‌توانید ببینید؛ اما تأیید تنها با مسئول تعیین‌شده یا نقشی با سقف متناسب ممکن است.
              </div>
            )
          ) : (
            <DecisionResult decision={decision} onReset={reset} />
          )}
        </div>
      </div>

      {/* شواهد پشتیبان */}
      <section className="mt-8">
        <h2 className="mb-2 text-sm font-medium">شواهد پشتیبان</h2>
        <EvidenceRow id="EV-110" />
        <EvidenceRow id="EV-111" />
        <EvidenceRow id="EV-112" />
        <EvidenceRow id="EV-120" />
        <Link
          href="/activity"
          className="mt-3 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900"
        >
          مشاهدهٔ کامل گزارش حسابرسی <ArrowRight size={12} />
        </Link>
      </section>
    </div>
  );
}

function DecisionResult({
  decision,
  onReset,
}: {
  decision: Exclude<Decision, "pending">;
  onReset: () => void;
}) {
  if (decision === "approved") {
    return (
      <div>
        <div className="flex items-center gap-2 rounded-md border-l-2 border-green-600 bg-green-50 p-4 text-sm">
          <Check size={14} className="shrink-0 text-green-700" />
          همین حالا تأیید شد — همراه با شواهد EV-110 و تصویر سیاست EV-120 ثبت شد. فرمان در حال اجراست.
        </div>
        <Link
          href="/workflows/wf-1042/execution"
          className="mt-3 inline-flex items-center gap-1 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover"
        >
          پیگیری اجرا <ArrowRight size={12} />
        </Link>
      </div>
    );
  }
  if (decision === "rejected") {
    return (
      <div className="rounded-md border-l-2 border-red-600 bg-red-50 p-4 text-sm leading-relaxed">
        رد شد — جریان کار متوقف شد. هیچ سفارشی ثبت و هزینه‌ای نشده است. هر دو پیشنهاد دیگر برای آغاز دوبارهٔ تأمین باز می‌مانند.
        <div className="mt-3">
          <Link href="/activity" className="inline-flex items-center gap-1 underline">
            آنچه بعد اتفاق افتاد <ArrowRight size={12} />
          </Link>
        </div>
      </div>
    );
  }
  return (
    <div>
      {decision === "change_requested" ? (
        <div className="rounded-md border-l-2 border-amber-600 bg-amber-50 p-4 text-sm leading-relaxed">
          اصلاح درخواست شد — عامل ارزیابی پیشنهاد را با زمان‌های تحویل به‌روز از هر سه تأمین‌کننده بازنگری می‌کند. حداکثر ظرف یک ساعت همین‌جا خبر داده می‌شود؛ تا آن موقع هیچ سفارشی ثبت نشده است.
        </div>
      ) : (
        <div className="rounded-md border-l-2 border-amber-600 bg-amber-50 p-4 text-sm leading-relaxed">
          شواهد بیشتر درخواست شد — فرمان از مراجع «سامیت فلکسیبل پکیجینگ» گواهی تحویل به‌موقع و از «وردپک» دادهٔ عملکرد مشتریان مشابه را می‌خواهد. تأیید با هر چه برسد به همین‌جا بازمی‌گردد.
        </div>
      )}
      <button onClick={onReset} className="mt-3 text-sm text-neutral-400 underline hover:text-neutral-600">
        نمایشی: بازگشت به وضعیت در انتظار تصمیم
      </button>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-xs text-neutral-400">{children}</div>;
}

function supplierName(offer: Offer): string {
  return supplierRecords.find((s) => s.id === offer.supplierId)?.name ?? "";
}

function EvidenceRow({ id }: { id: string }) {
  return (
    <div className="flex items-start gap-3 border-[0.5px] border-borders px-4 py-2.5 [margin-top:-0.5px]">
      <EvidenceChip id={id} />
    </div>
  );
}
