"use client";

import { company, roles, users, budgetCategories } from "@/lib/mock-data";
import { money } from "@/lib/format";
import { PageHeader, Card, MetricGroup, Metric } from "@/components/ui";

export default function BusinessPage() {
  return (
    <div>
      <PageHeader
        title="کسب‌وکار"
        meta={`${company.name} · ${company.workspace} · فضای کاری`}
      />

      <MetricGroup>
        {budgetCategories.map((c) => (
          <Metric
            key={c.id}
            label={c.name}
            value={money(c.monthlyCap - c.committed)}
            note={`باقی از ${money(c.monthlyCap)} سقف`}
          />
        ))}
      </MetricGroup>

      <section className="mt-8">
        <h2 className="mb-2 text-sm font-medium">افراد و دسترسی‌ها</h2>
        <div className="border-[0.5px] border-borders">
          {users.map((u) => {
            const role = roles.find((r) => r.id === u.roleId);
            return (
              <div key={u.id} className="-mt-[0.5px] border-[0.5px] border-borders px-4 py-3 first:mt-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 text-sm">
                  <span>{u.name}</span>
                  <span className="text-neutral-500">{role?.title}</span>
                </div>
                <div className="tnum mt-0.5 text-sm text-neutral-500">
                  تأیید سفارش‌های تکی تا {money(role?.approvalLimit ?? 0)}
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-sm text-neutral-400">
          نقش‌ها در بخش 
          <span className="underline">سیاست‌ها و دسترسی‌ها</span> مدیریت می‌شود (در نسخهٔ نمایشی فقط خواندنی).
        </p>
      </section>

      <section className="mt-8">
        <Card>
          <h2 className="text-sm font-medium">فضاهای کاری</h2>
          <p className="mt-1 text-sm leading-relaxed text-neutral-600">
            این نسخهٔ نمایشی در یک فضای کاری — عملیات — اجرا می‌شود. در محیط اصلی، هر واحد کسب‌وکار فضای کاری مستقل با سیاست‌ها، بودجه‌ها و حسابرسی جداگانه دارد.
          </p>
        </Card>
      </section>
    </div>
  );
}
