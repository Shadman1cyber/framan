import type { ReactNode } from "react";
import { ModulePage } from "./ModulePage";
import { dashboardModules, MODULE_SECTIONS, type ModuleKind } from "@/lib/dashboard/modules";
import type { RelatedLink } from "./RelatedSections";

/**
 * An admin section that belongs to a module (انبار, دسته‌ها, محصولات, باشگاه
 * مشتریان, امتیازها, میزها …). It renders inside the module's dark shell with
 * the module header and stats, and links back to the module plus its sibling
 * sections so the user can move around the module without the sidebar.
 *
 * The section's own body keeps working unchanged: `data-legacy-surface` is the
 * hook the scoped token remap in globals.css keys off, which maps the legacy
 * card/input/chip utilities onto the dashboard surfaces and the module accent.
 */
export function SectionPage({
  kind,
  title,
  description,
  exclude,
  children,
}: {
  kind: ModuleKind;
  title: string;
  description?: string;
  /** Section to leave out of the related list (usually the current page). */
  exclude?: string;
  children: ReactNode;
}) {
  const moduleLink: RelatedLink = { href: `/admin/${kind}`, label: dashboardModules[kind].label, icon: kind === "crm" ? "🎁" : kind === "erp" ? "🌿" : "💰" };
  const siblings = MODULE_SECTIONS[kind]
    .filter((section) => section.href !== exclude)
    .map((section) => ({ href: section.href, label: section.label, icon: section.icon }));

  return (
    <ModulePage kind={kind} title={title} related={[moduleLink, ...siblings]}>
      {description ? <p className="mb-4 text-xs leading-relaxed text-dashboard-foreground">{description}</p> : null}
      <div data-legacy-surface="dashboard">{children}</div>
    </ModulePage>
  );
}
