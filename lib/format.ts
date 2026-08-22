export function money(value: number): string {
  const abs = Math.abs(value);
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: abs % 1 === 0 ? 0 : 2,
    maximumFractionDigits: abs % 1 === 0 ? 0 : 2,
  }).format(abs);
  return value < 0 ? `−${formatted}` : formatted;
}

export function signedMoney(value: number): string {
  return (value < 0 ? "" : "+") + money(value);
}
