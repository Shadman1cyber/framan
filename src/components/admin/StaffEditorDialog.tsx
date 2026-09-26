"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import { JalaliDateInput } from "@/components/ui/JalaliInputs";
import { formatJalaliDate } from "@/lib/jalali";
import { STAFF_ROLES, STAFF_ROLE_LABELS_FA, type StaffRole } from "@/lib/constants";
import { addDaysToDateKey, resolveStaffShift, type StaffShiftSlot } from "@/lib/staff-shifts";

export type StaffOpt = {
  id: string;
  name: string;
  role: string;
  task: string | null;
  shiftStart: string | null;
  shiftEnd: string | null;
  isActive: boolean;
  shiftRotation: {
    id?: string;
    isEnabled: boolean;
    startDate: string;
    slots: StaffShiftSlot[];
  } | null;
};

export type StaffEditorPayload = {
  name: string;
  role: StaffRole;
  task: string | null;
  isActive: boolean;
  shiftStart: string | null;
  shiftEnd: string | null;
  rotation: {
    isEnabled: boolean;
    startDate: string;
    slots: StaffShiftSlot[];
  } | null;
};

type Draft = {
  name: string;
  role: StaffRole;
  task: string;
  isActive: boolean;
  shiftStart: string;
  shiftEnd: string;
  rotationEnabled: boolean;
  rotationStartDate: string;
  slots: StaffShiftSlot[];
};

const DEFAULT_SLOTS: StaffShiftSlot[] = [
  { position: 0, label: "صبح", shiftStart: "08:00", shiftEnd: "16:00" },
  { position: 1, label: "عصر", shiftStart: "16:00", shiftEnd: "00:00" },
  { position: 2, label: "تعطیل", shiftStart: null, shiftEnd: null },
];

function normalizedSlots(slots: StaffShiftSlot[]): StaffShiftSlot[] {
  return slots.map((slot, position) => ({ ...slot, position }));
}

function initialDraft(staff: StaffOpt, today: string): Draft {
  const rotation = staff.shiftRotation;
  return {
    name: staff.name,
    role: (STAFF_ROLES.includes(staff.role as StaffRole) ? staff.role : "OTHER") as StaffRole,
    task: staff.task ?? "",
    isActive: staff.isActive,
    shiftStart: staff.shiftStart ?? "09:00",
    shiftEnd: staff.shiftEnd ?? "18:00",
    rotationEnabled: rotation?.isEnabled ?? false,
    rotationStartDate: rotation?.startDate ?? today,
    slots: normalizedSlots(rotation?.slots.length ? rotation.slots : DEFAULT_SLOTS),
  };
}

function StaffEditorDialog({
  staff,
  today,
  onClose,
  onSave,
}: {
  staff: StaffOpt;
  today: string;
  onClose: () => void;
  onSave: (payload: StaffEditorPayload) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Draft>(() => initialDraft(staff, today));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, saving]);

  const previewRotation = useMemo(() => ({
    isEnabled: draft.rotationEnabled,
    startDate: draft.rotationStartDate,
    slots: draft.slots,
  }), [draft.rotationEnabled, draft.rotationStartDate, draft.slots]);
  const previewStart = draft.rotationEnabled && draft.rotationStartDate > today ? draft.rotationStartDate : today;
  const previewDates = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDaysToDateKey(previewStart, index)),
    [previewStart],
  );

  function updateSlot(position: number, patch: Partial<StaffShiftSlot>) {
    setDraft((current) => ({
      ...current,
      slots: current.slots.map((slot) => slot.position === position ? { ...slot, ...patch } : slot),
    }));
  }

  function removeSlot(position: number) {
    setDraft((current) => ({
      ...current,
      slots: normalizedSlots(current.slots.filter((slot) => slot.position !== position)),
    }));
  }

  function addSlot() {
    setDraft((current) => {
      if (current.slots.length >= 7) return current;
      return {
        ...current,
        slots: normalizedSlots([
          ...current.slots,
          { position: current.slots.length, label: `شیفت ${current.slots.length + 1}`, shiftStart: "09:00", shiftEnd: "18:00" },
        ]),
      };
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.name.trim()) {
      setError("نام پرسنل الزامی است");
      return;
    }
    if (draft.rotationEnabled) {
      if (!draft.rotationStartDate) {
        setError("تاریخ شروع چرخه را انتخاب کنید");
        return;
      }
      if (draft.slots.length < 2) {
        setError("چرخه باید حداقل دو شیفت داشته باشد");
        return;
      }
      if (draft.slots.some((slot) => !slot.label.trim())) {
        setError("برای هر شیفت یک عنوان وارد کنید");
        return;
      }
      if (draft.slots.some((slot) => (slot.shiftStart == null) !== (slot.shiftEnd == null))) {
        setError("ساعت شروع و پایان هر شیفت باید کامل باشد");
        return;
      }
    }
    setError("");
    setSaving(true);
    try {
      await onSave({
        name: draft.name.trim(),
        role: draft.role,
        task: draft.task.trim() || null,
        isActive: draft.isActive,
        shiftStart: draft.shiftStart || null,
        shiftEnd: draft.shiftEnd || null,
        rotation: draft.rotationEnabled || staff.shiftRotation !== null
          ? {
              isEnabled: draft.rotationEnabled,
              startDate: draft.rotationStartDate,
              slots: normalizedSlots(draft.slots),
            }
          : null,
      });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "ذخیره تغییرات ناموفق بود");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-espresso/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="staff-editor-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <form onSubmit={submit} className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-coffee/20 bg-cream p-4 shadow-2xl dark:border-dark-border dark:bg-dark-surface sm:p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="staff-editor-title" className="heading-card !text-lg">ویرایش پرسنل</h2>
            <p className="mt-1 text-xs text-muted">ساعت کاری یا چرخهٔ شیفت این پرسنل را تغییر دهید.</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="btn-ghost text-xs">بستن</button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-muted">
            نام
            <input autoFocus required className="input mt-1 w-full" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          </label>
          <label className="text-xs text-muted">
            نقش
            <select className="input mt-1 w-full" value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value as StaffRole })}>
              {STAFF_ROLES.map((role) => <option key={role} value={role}>{STAFF_ROLE_LABELS_FA[role]}</option>)}
            </select>
          </label>
          <label className="text-xs text-muted sm:col-span-2">
            وظیفه
            <input className="input mt-1 w-full" placeholder="مثلاً بار سرد، سالن" value={draft.task} onChange={(event) => setDraft({ ...draft, task: event.target.value })} />
          </label>
          <label className="flex items-center gap-2 text-xs text-muted sm:col-span-2">
            <input type="checkbox" className="h-4 w-4 accent-olive-600" checked={draft.isActive} onChange={(event) => setDraft({ ...draft, isActive: event.target.checked })} />
            پرسنل فعال باشد
          </label>
        </div>

        <section className="mt-5 border-t border-coffee/10 pt-4 dark:border-dark-border">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold">ساعت کاری ثابت</h3>
              <p className="mt-1 text-[11px] text-muted">در روزهایی که چرخه فعال نیست یا شیفت ثابت تعیین شده استفاده می‌شود.</p>
            </div>
            <div className="flex gap-2">
              <input className="input tabular-nums" type="time" aria-label="شروع ساعت ثابت" value={draft.shiftStart} onChange={(event) => setDraft({ ...draft, shiftStart: event.target.value })} />
              <input className="input tabular-nums" type="time" aria-label="پایان ساعت ثابت" value={draft.shiftEnd} onChange={(event) => setDraft({ ...draft, shiftEnd: event.target.value })} />
            </div>
          </div>
        </section>

        <section className="mt-5 border-t border-coffee/10 pt-4 dark:border-dark-border">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold">شیفت چرخشی</h3>
              <p className="mt-1 text-[11px] text-muted">ترتیب شیفت‌ها از تاریخ شروع، هر روز یک‌بار تکرار می‌شود. برای روز تعطیل، هر دو ساعت را خالی کنید.</p>
            </div>
            <label className="flex items-center gap-2 text-xs font-semibold">
              <input type="checkbox" className="h-4 w-4 accent-olive-600" checked={draft.rotationEnabled} onChange={(event) => setDraft({ ...draft, rotationEnabled: event.target.checked })} />
              فعال‌سازی چرخه
            </label>
          </div>

          {draft.rotationEnabled && (
            <>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                <span className="text-muted">شروع چرخه:</span>
                <JalaliDateInput value={draft.rotationStartDate} onChange={(value) => setDraft({ ...draft, rotationStartDate: value })} ariaLabel="شروع چرخه شیفت" />
              </div>
              <div className="mt-3 space-y-2">
                {draft.slots.map((slot) => {
                  const isDayOff = !slot.shiftStart || !slot.shiftEnd;
                  return (
                    <div key={slot.id ?? `${slot.position}-${slot.label}`} className="grid gap-2 rounded-xl border border-coffee/10 bg-beige-soft/50 p-2.5 dark:border-dark-border dark:bg-dark-bg sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-end">
                      <label className="text-[11px] text-muted">
                        عنوان شیفت
                        <input className="input mt-1 w-full" value={slot.label} maxLength={40} onChange={(event) => updateSlot(slot.position, { label: event.target.value })} />
                      </label>
                      <label className="flex items-center gap-1.5 pb-2 text-[11px] text-muted">
                        <input type="checkbox" className="h-4 w-4 accent-olive-600" checked={isDayOff} onChange={(event) => updateSlot(slot.position, event.target.checked ? { shiftStart: null, shiftEnd: null } : { shiftStart: "09:00", shiftEnd: "18:00" })} />
                        تعطیل
                      </label>
                      <div className="flex gap-2">
                        <input className="input tabular-nums" type="time" aria-label={`شروع ${slot.label}`} disabled={isDayOff} value={slot.shiftStart ?? ""} onChange={(event) => updateSlot(slot.position, { shiftStart: event.target.value || null })} />
                        <input className="input tabular-nums" type="time" aria-label={`پایان ${slot.label}`} disabled={isDayOff} value={slot.shiftEnd ?? ""} onChange={(event) => updateSlot(slot.position, { shiftEnd: event.target.value || null })} />
                      </div>
                      <button type="button" disabled={draft.slots.length <= 2} onClick={() => removeSlot(slot.position)} className="btn-ghost text-xs text-danger sm:mb-1">حذف</button>
                    </div>
                  );
                })}
              </div>
              <button type="button" disabled={draft.slots.length >= 7} onClick={addSlot} className="btn-secondary mt-2 text-xs">افزودن شیفت به چرخه</button>

              <div className="mt-4 rounded-xl border border-olive/25 bg-olive/5 p-3">
                <p className="text-xs font-semibold">پیش‌نمایش هفت روز آینده</p>
                <div className="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
                  {previewDates.map((date) => {
                    const shift = resolveStaffShift(draft.shiftStart, draft.shiftEnd, previewRotation, date);
                    return (
                      <div key={date} className="rounded-lg bg-cream/80 px-2 py-1.5 text-[11px] dark:bg-dark-surface">
                        <span className="block text-muted">{formatJalaliDate(date)}</span>
                        <span className="font-semibold">{shift.isDayOff ? "تعطیل" : `${shift.label} · ${shift.shiftStart ?? "—"} تا ${shift.shiftEnd ?? "—"}`}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </section>

        {error && <p role="alert" className="mt-4 rounded-xl border border-danger/30 bg-danger/5 p-3 text-xs text-danger">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={saving} className="btn-secondary">انصراف</button>
          <button type="submit" disabled={saving} className="btn-primary">{saving ? "در حال ذخیره…" : "ذخیره تغییرات"}</button>
        </div>
      </form>
    </div>
  );
}

export { StaffEditorDialog };
