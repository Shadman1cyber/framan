export function AllergenBadge({
  nameFa,
  status,
}: {
  nameFa: string;
  status: "CONTAINS" | "MAY_CONTAIN" | "UNKNOWN";
}) {
  const styles =
    status === "CONTAINS"
      ? "border-danger/30 bg-danger/10 text-danger"
      : status === "MAY_CONTAIN"
      ? "border-warning/30 bg-warning/10 text-warning"
      : "border-coffee/20 bg-beige text-espresso/60";
  const label =
    status === "CONTAINS" ? "حاوی" : status === "MAY_CONTAIN" ? "احتمالاً حاوی" : "نامشخص";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles}`}>
      <span aria-hidden="true">⚠</span>
      <span>{nameFa} · {label}</span>
    </span>
  );
}

export function DietaryBadge({ nameFa, icon }: { nameFa: string; icon?: string | null }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-olive/30 bg-olive-50 px-2.5 py-0.5 text-xs font-medium text-olive-600">
      {icon && <span aria-hidden="true">{icon}</span>}
      <span>{nameFa}</span>
    </span>
  );
}