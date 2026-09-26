import Link from "next/link";

export type RelatedLink = { href: string; label: string; icon?: string };

/**
 * Deep links into the module's existing admin sections, so the old section
 * tabs stay reachable from the module page that owns them. Hover state reads
 * the same `--module-primary` tokens as the charts.
 */
export function RelatedSections({ label, links }: { label: string; links: RelatedLink[] }) {
  return (
    <nav aria-label={label} className="mb-5 flex flex-wrap items-center gap-2">
      <span className="ml-1 text-[12px] font-semibold text-dashboard-foreground">{label}</span>
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="inline-flex min-h-9 items-center gap-2 rounded-full border border-dashboard-line bg-dashboard-surface/75 px-3.5 text-[12px] font-semibold text-dashboard-foreground transition-colors hover:border-[rgb(var(--module-primary-rgb)/0.6)] hover:bg-[var(--module-tint)]"
        >
          {link.icon ? <span aria-hidden="true">{link.icon}</span> : null}
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
