export function AllergenBadge({
  nameFa,
  icon,
}: {
  nameFa: string;
  icon?: string | null;
}) {
  // Requirement 4: show the allergen name directly — no "حاوی:" wording.
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-danger/25 bg-danger/5 px-2.5 py-0.5 text-xs font-medium text-danger">
      {icon ? (
        <span aria-hidden="true">{icon}</span>
      ) : (
        <span aria-hidden="true">⚠</span>
      )}
      <span>{nameFa}</span>
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