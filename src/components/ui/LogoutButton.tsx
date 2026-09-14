"use client";
import { useState } from "react";
import { createPortal } from "react-dom";
import { signOut } from "next-auth/react";

/**
 * Elegant RTL logout confirmation dialog in the café theme.
 * Rendered through a portal to <body> so it always paints above page
 * content (a sticky sidebar would otherwise trap the z-index).
 */
export function LogoutButton({
  className,
  label = "خروج",
  callbackUrl = "/",
}: {
  className?: string;
  label?: string;
  callbackUrl?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className ?? "btn-ghost text-sm text-danger"}
      >
        {label}
      </button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[90] flex items-center justify-center bg-espresso/60 p-4 backdrop-blur-md"
            role="dialog"
            aria-modal="true"
            aria-labelledby="logout-title"
            onClick={() => setOpen(false)}
          >
            <div
              className="w-full max-w-sm rounded-2xl border border-coffee/15 bg-cream-50 p-6 shadow-elevated animate-fade-in"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-danger/10 text-xl"
                >
                  ⏎
                </span>
                <div>
                  <h2 id="logout-title" className="heading-card">
                    از حساب خود خارج می‌شوید؟
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    در صورت تایید، از حساب کاربری‌تان خارج می‌شوید و به صفحه اصلی بازمی‌گردید.
                  </p>
                </div>
              </div>
              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="btn-secondary flex-1"
                >
                  لغو
                </button>
                <button
                  type="button"
                  onClick={() => signOut({ callbackUrl })}
                  className="btn-danger flex-1"
                >
                  خروج
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
