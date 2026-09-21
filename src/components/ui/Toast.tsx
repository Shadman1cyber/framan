"use client";
import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

type Toast = { id: number; kind: "success" | "error" | "info"; message: string };

const ToastContext = createContext<{
  show: (msg: string, kind?: Toast["kind"]) => void;
  dismiss: (id: number) => void;
} | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const show = useCallback((message: string, kind: Toast["kind"] = "info") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3000);
  }, []);
  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);
  return (
    <ToastContext.Provider value={{ show, dismiss }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+1rem)] z-[100] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={
              "pointer-events-auto animate-fade-in rounded-xl border px-4 py-2 text-sm shadow-elevated backdrop-blur flex items-center justify-between gap-3 " +
              (t.kind === "success"
                ? "border-olive/30 bg-olive-50 text-olive-600 dark:border-olive/40 dark:bg-olive/10 dark:text-olive-300"
                : t.kind === "error"
                ? "border-danger/30 bg-danger/10 text-danger dark:border-danger/40 dark:bg-danger/10 dark:text-danger"
                : "border-coffee/20 bg-coffee/10 text-espresso dark:border-dark-border dark:bg-coffee/10 dark:text-dark-text")
            }
            role="status"
          >
            <span>{t.message}</span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="ms-3 flex-shrink-0 p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
              aria-label="بستن"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
