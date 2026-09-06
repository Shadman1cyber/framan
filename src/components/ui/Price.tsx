import { formatToman } from "@/lib/format";

export function Price({
  amount,
  className,
  size = "md",
}: {
  amount: number;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const sizes = {
    sm: "text-sm",
    md: "text-base",
    lg: "text-xl",
  };
  return (
    <span
      className={`font-semibold text-espresso tabular-nums ${sizes[size]} ${className ?? ""}`}
    >
      {formatToman(amount)}
    </span>
  );
}