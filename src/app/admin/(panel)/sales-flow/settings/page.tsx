"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

type Schedule = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isEnabled: boolean;
  crossesMidnight: boolean;
};

type Settings = {
  granularityMin: number;
  timezone: string;
  schedules: Schedule[];
};

const DAYS_FA = [
  "یکشنبه",
  "دوشنبه",
  "سه‌شنبه",
  "چهارشنبه",
  "پنج‌شنبه",
  "جمعه",
  "شنبه",
];

const GRANULARITY_OPTIONS = [
  { value: 15, label: "۱۵ دقیقه" },
  { value: 30, label: "۳۰ دقیقه" },
  { value: 60, label: "۱ ساعت" },
  { value: 120, label: "۲ ساعت" },
  { value: 240, label: "۴ ساعت" },
  { value: 480, label: "۸ ساعت" },
];

export default function SalesFlowSettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    try {
      const res = await fetch("/api/admin/sales-flow/settings");
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  function handleScheduleChange(dayOfWeek: number, field: keyof Schedule, value: string | boolean) {
    if (!settings) return;
    setSettings({
      ...settings,
      schedules: settings.schedules.map((s) =>
        s.dayOfWeek === dayOfWeek ? { ...s, [field]: value } : s
      ),
    });
  }

  function handleGranularityChange(value: number) {
    if (!settings) return;
    setSettings({ ...settings, granularityMin: value });
  }

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/admin/sales-flow/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      if (res.ok) {
        setMessage({ type: "success", text: "تنظیمات با موفقیت ذخیره شد" });
        await fetchSettings();
      } else {
        const err = await res.json();
        setMessage({ type: "error", text: err.error || "خطا در ذخیره تنظیمات" });
      }
    } catch (e) {
      setMessage({ type: "error", text: "خطا در اتصال به سرور" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-olive border-t-transparent"></div>
      </div>
    );
  }

  if (!settings) {
    return <div className="text-center text-muted py-8">تنظیمات یافت نشد</div>;
  }

  return (
    <div className="max-w-3xl">
      <h1 className="heading-section mb-6">تنظیمات جریان فروش</h1>

      {message && (
        <div
          className={`mb-4 p-3 rounded-xl text-sm ${
            message.type === "success"
              ? "bg-emerald/10 text-emerald border border-emerald/30"
              : "bg-rose/10 text-rose border border-rose/30"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="card p-4 mb-6">
        <h2 className="mb-4 text-sm font-semibold">دقت زمانی (Granularity)</h2>
        <div className="flex flex-wrap gap-2">
          {GRANULARITY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleGranularityChange(opt.value)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                settings.granularityMin === opt.value
                  ? "bg-olive text-cream"
                  : "bg-beige text-espresso hover:bg-coffee/10"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <label className="text-sm text-muted">سفارشی:</label>
          <input
            type="number"
            min="1"
            max="1440"
            value={settings.granularityMin}
            onChange={(e) => handleGranularityChange(parseInt(e.target.value) || 1)}
            className="input w-24"
          />
          <span className="text-xs text-muted">دقیقه (حداکثر ۱۴۴۰)</span>
        </div>
        <p className="mt-2 text-xs text-muted">
          فاصله زمانی بین هر بازه در نمودار جریان فروش. بازه‌های کوچک‌تر جزئیات بیشتر می‌دهند اما نمودار عریض‌تر می‌شود.
        </p>
      </div>

      <div className="card p-4">
        <h2 className="mb-4 text-sm font-semibold">ساعات فعالیت بر اساس روز هفته</h2>
        <div className="space-y-3">
          {settings.schedules
            .slice()
            .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
            .map((schedule) => (
              <div key={schedule.dayOfWeek} className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-xl bg-beige-soft">
                <div className="w-24 sm:w-28 font-medium text-espresso">{DAYS_FA[schedule.dayOfWeek]}</div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={schedule.isEnabled}
                    onChange={(e) => handleScheduleChange(schedule.dayOfWeek, "isEnabled", e.target.checked)}
                    className="h-4 w-4 rounded border-coffee/30 text-olive focus:ring-olive"
                  />
                  <span>فعال</span>
                </label>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted">از</span>
                  <input
                    type="time"
                    value={schedule.startTime}
                    onChange={(e) => handleScheduleChange(schedule.dayOfWeek, "startTime", e.target.value)}
                    disabled={!schedule.isEnabled}
                    className="input w-24"
                  />
                  <span className="text-muted">تا</span>
                  <input
                    type="time"
                    value={schedule.endTime}
                    onChange={(e) => handleScheduleChange(schedule.dayOfWeek, "endTime", e.target.value)}
                    disabled={!schedule.isEnabled}
                    className="input w-24"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-muted">
                  <input
                    type="checkbox"
                    checked={schedule.crossesMidnight}
                    onChange={(e) => handleScheduleChange(schedule.dayOfWeek, "crossesMidnight", e.target.checked)}
                    disabled={!schedule.isEnabled}
                    className="h-4 w-4 rounded border-coffee/30 text-olive focus:ring-olive"
                  />
                  <span>میان‌شب</span>
                </label>
                {schedule.isEnabled && (
                  <span className="text-xs ml-auto">
                    {schedule.crossesMidnight
                      ? "بازه از میان‌شب می‌گذرد"
                      : schedule.startTime >= schedule.endTime
                      ? "⚠ زمان شروع باید قبل از پایان باشد"
                      : ""}
                  </span>
                )}
              </div>
            ))}
        </div>
        <p className="mt-3 text-xs text-muted">
          برای هر روز هفته، ساعات فعالیت را تعیین کنید. بازه‌های زمانی فقط در ساعات فعال محاسبه می‌شوند.
          فعال کردن «میان‌شب» اجازه می‌دهد بازه از ساعت ۲۲:۰۰ تا ۰۲:۰۰ شب ادامه یابد.
        </p>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="btn-primary"
        >
          {saving ? "در حال ذخیره..." : "ذخیره تنظیمات"}
        </button>
      </div>
    </div>
  );
}