const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

export function faDigits(input: string | number): string {
  return String(input).replace(/\d/g, (d) => FA_DIGITS[Number(d)]);
}

function group(n: number): string {
  return faDigits(
    new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
      Math.abs(n),
    ),
  ).replace(/,/g, "٬");
}

export function money(value: number): string {
  return value < 0 ? `−${group(value)} ریال` : `${group(value)} ریال`;
}

export function signedMoney(value: number): string {
  return (value < 0 ? "" : "+") + money(value);
}

export function faNum(value: number): string {
  return group(value);
}
