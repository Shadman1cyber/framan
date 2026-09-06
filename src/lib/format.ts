export function formatToman(amount: number): string {
  return new Intl.NumberFormat("fa-IR").format(amount) + " تومان";
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("fa-IR").format(value);
}