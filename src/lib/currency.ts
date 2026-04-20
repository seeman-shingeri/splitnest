export const CURRENCY = "AED";

export function formatCurrency(amount: number | string | null | undefined): string {
  const n = typeof amount === "string" ? parseFloat(amount) : amount ?? 0;
  if (isNaN(n as number)) return `${CURRENCY} 0.00`;
  return `${CURRENCY} ${(n as number).toLocaleString("en-AE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
