/**
 * Formatting helpers.
 *
 * Date handling now lives in `./date.ts` (which parses `YYYY-MM-DD` as a local
 * calendar date). These are re-exported so existing imports keep working.
 */
import { parseDate } from "./date.ts";

export {
  formatDate,
  formatDateShort,
  isValidDateInput,
  parseDate,
  toDateInputValue,
  todayISODate,
} from "./date.ts";

export { toNumber } from "./inventory.ts";

const currencyFormatter = new Intl.NumberFormat("en-PK", {
  maximumFractionDigits: 2,
});

const currencyFormatterWhole = new Intl.NumberFormat("en-PK", {
  maximumFractionDigits: 0,
});

export function formatMoney(value: number, fractionDigits = 2): string {
  const amount = Number.isFinite(value) ? value : 0;

  const formatted =
    fractionDigits === 0
      ? currencyFormatterWhole.format(amount)
      : currencyFormatter.format(amount);

  return `Rs. ${formatted}`;
}

export function formatCompactMoney(value: number): string {
  const amount = Number.isFinite(value) ? value : 0;
  const absolute = Math.abs(amount);

  if (absolute >= 1_000_000) {
    return `Rs. ${(amount / 1_000_000).toFixed(absolute >= 10_000_000 ? 0 : 1)}M`;
  }

  if (absolute >= 1_000) {
    return `Rs. ${(amount / 1_000).toFixed(absolute >= 10_000 ? 0 : 1)}K`;
  }

  return `Rs. ${currencyFormatterWhole.format(amount)}`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-PK").format(
    Number.isFinite(value) ? value : 0
  );
}

export function initials(value: string | null | undefined): string {
  const text = (value ?? "").trim();

  if (!text) return "U";

  const parts = text.split(/\s+/).filter(Boolean);

  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function buildMonthlySeries(
  sales: { amount: number; date: string }[],
  options: { months?: number; withinYear?: boolean } = {}
): { label: string; amount: number }[] {
  const monthCount = options.months ?? 12;
  const buckets: {
    label: string;
    amount: number;
    year: number;
    month: number;
  }[] = [];
  const now = new Date();

  if (options.withinYear) {
    const year = now.getFullYear();

    for (let index = 0; index < 12; index += 1) {
      const date = new Date(year, index, 1);

      buckets.push({
        label: date.toLocaleString("en-US", { month: "short" }),
        amount: 0,
        year,
        month: index,
      });
    }
  } else {
    for (let index = monthCount - 1; index >= 0; index -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - index, 1);

      buckets.push({
        label: date.toLocaleDateString("en-US", { month: "short" }),
        amount: 0,
        year: date.getFullYear(),
        month: date.getMonth(),
      });
    }
  }

  sales.forEach((sale) => {
    const date = parseDate(sale.date);

    if (!date) return;

    const bucket = buckets.find(
      (item) =>
        item.year === date.getFullYear() && item.month === date.getMonth()
    );

    if (bucket) bucket.amount += Number(sale.amount ?? 0);
  });

  return buckets.map(({ label, amount }) => ({ label, amount }));
}