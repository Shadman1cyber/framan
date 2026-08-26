"use client";

import { company } from "@/lib/mock-data";
import { useDemo } from "@/lib/store";
import { Btn, PageHeader } from "@/components/ui";

const integrations = [
  {
    name: "ERP / accounting sync",
    state: "افت کارکرد — تلاش مجدد",
    detail:
      "Connection timeout at 11:42 while posting an accrual. Automatic retries run every 4 minutes; escalates after three failures.",
    cls: "text-red-700",
  },
  {
    name: "Packline ordering portal",
    state: "متصل",
    detail: "برای ارسال سفارش‌های خرید و دریافت تأییدیه استفاده می‌شود. آخرین ارتباط ۱۱:۵۸.",
    cls: "text-green-700",
  },
  {
    name: "Supplier email intake",
    state: "متصل",
    detail: "پیشنهادهای پیوستی تحلیل، زمان‌نگاری و به‌عنوان سند ثبت می‌شوند.",
    cls: "text-green-700",
  },
];

export default function SettingsPage() {
  const { reset } = useDemo();
  return (
    <div>
      <PageHeader title="تنظیمات و یکپارچه‌سازی" meta={`${company.name} · demo environment`} />

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-medium">یکپارچه‌سازی‌ها</h2>
        <div className="space-y-[0.5px]">
          {integrations.map((i) => (
            <div key={i.name} className="border-[0.5px] border-borders px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 text-sm">
                <span>{i.name}</span>
                <span className={i.cls}>{i.state}</span>
              </div>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-neutral-500">{i.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-medium">نسخهٔ نمایشی</h2>
        <div className="rounded-xl border-[0.5px] border-borders p-5">
          <p className="max-w-xl text-sm leading-relaxed text-neutral-600">
            این نسخه یک نمایش کلیکی با دادهٔ ازپیش‌تعریف‌شده است. بازنشانی، فضای کاری را به نقطهٔ آغاز برمی‌گرداند: درخواست بسته‌بندی در انتظار تأیید شما.
          </p>
          <div className="mt-3">
            <Btn onClick={reset}>بازنشانی داده‌های نمایشی</Btn>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium">مدیریت داده</h2>
        <p className="max-w-xl text-sm leading-relaxed text-neutral-500">
          همهٔ داده‌های این نسخهٔ نمایشی خیالی و در حافظه ذخیره می‌شوند. هیچ سرویس بیرونی فراخوانی نمی‌شود؛ پاسخ‌های تأمین‌کنندگان، سیاست‌ها و ارقام مالی نمونهٔ ثابت‌اند.
        </p>
      </section>
    </div>
  );
}
