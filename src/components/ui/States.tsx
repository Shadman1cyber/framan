import type { ReactNode } from "react";

export function EmptyState({
  title,
  description,
  icon,
  action,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-coffee/20 bg-cream-50 p-10 text-center dark:border-dark-border dark:bg-dark-surface">
      {icon && <div className="mb-3 text-4xl text-coffee/60 dark:text-dark-textSecondary">{icon}</div>}
      <h3 className="heading-card">{title}</h3>
      {description && <p className="mt-2 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-danger/20 bg-danger/5 p-10 text-center dark:border-danger/40 dark:bg-danger/10">
      <div className="mb-3 text-3xl">⚠</div>
      <h3 className="heading-card text-danger">{title}</h3>
      {description && <p className="mt-2 max-w-sm text-sm text-espresso/70 dark:text-dark-textSecondary">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={`skeleton ${className ?? ""}`} aria-hidden="true" />;
}