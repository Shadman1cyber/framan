/** Persian-friendly slug generator. Used to auto-generate slugs so admins never enter them. */
export function slugify(input: string): string {
  const base = input
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^\p{L}\p{N}-]+/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return base || `p-${Date.now().toString(36)}`;
}
