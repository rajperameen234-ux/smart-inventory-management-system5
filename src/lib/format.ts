/**
 * Formatting helpers.
 *
 * Date handling now lives in `./date.ts` (which parses `YYYY-MM-DD` as a local
 * calendar date). These are re-exported so existing imports keep working.
 */
import { parseDate } from "./date.ts";
import {
  BASE_CURRENCY,
  currencyInfo,
  convertFromPkr,
  type CurrencyCode,
} from "./currency.ts";

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

/**
 * The currency every money formatter renders in.
 *
 * The CurrencyProvider keeps this in sync with the shopkeeper's selection
 * before each render pass, so the hundreds of `formatMoney` call sites across
 * the app always convert from the stored base currency (PKR) into the
 * currently selected display currency without threading props everywhere.
 * When the selected currency has no usable exchange rate the formatters stay
 * on the base currency and the UI labels that state explicitly — a missing
 * rate never silently masquerades as a converted figure.
 */
type ActiveCurrency = {
  code: CurrencyCode;
  /** PKR per 1 unit of `code`; 1 for the base currency. */
  pkrPerUnit: number;
  /** True when the selected currency has no valid exchange rate. */
  rateMissing: boolean;
};

let activeCurrency: ActiveCurrency = {
  code: BASE_CURRENCY,
  pkrPerUnit: 1,
  rateMissing: false,
};

/** Called by the CurrencyProvider so formatters match the selected currency. */
export function applyActiveCurrency(next: ActiveCurrency): void {
  activeCurrency = next;
}

/** The active currency snapshot (used by tests and the provider). */
export function getActiveCurrency(): ActiveCurrency {
  return activeCurrency;
}

function formatNumberWith(amount: number, fractionDigits: number): string {
  return fractionDigits === 0
    ? currencyFormatterWhole.format(amount)
    : currencyFormatter.format(amount);
}

/**
 * Format a base-currency (PKR) amount in the currently selected display
 * currency, converting exactly once. This is the entry point for every stored
 * money figure (rows from Supabase, computed totals).
 */
export function formatMoney(value: number, fractionDigits = 2): string {
  const amount = Number.isFinite(value) ? value : 0;

  const displayAmount = activeCurrency.rateMissing
    ? amount
    : convertFromPkr(amount, activeCurrency.pkrPerUnit);

  const prefix = activeCurrency.rateMissing
    ? currencyInfo(BASE_CURRENCY).prefix
    : currencyInfo(activeCurrency.code).prefix;

  return `${prefix}${formatNumberWith(displayAmount, fractionDigits)}`;
}

/**
 * Format a value that is ALREADY expressed in the display currency (form
 * inputs and live previews typed in the selected currency). It must not be
 * converted again — that is what prevents double conversion.
 */
export function formatMoneyRaw(value: number, fractionDigits = 2): string {
  const amount = Number.isFinite(value) ? value : 0;
  const prefix =
    activeCurrency.rateMissing
      ? currencyInfo(BASE_CURRENCY).prefix
      : currencyInfo(activeCurrency.code).prefix;

  return `${prefix}${formatNumberWith(amount, fractionDigits)}`;
}

/**
 * Compact chart/stat formatting for base-currency amounts, converted exactly
 * once like `formatMoney`.
 */
export function formatCompactMoney(value: number): string {
  const amount = Number.isFinite(value) ? value : 0;

  const displayAmount = activeCurrency.rateMissing
    ? amount
    : convertFromPkr(amount, activeCurrency.pkrPerUnit);

  const prefix = activeCurrency.rateMissing
    ? currencyInfo(BASE_CURRENCY).prefix
    : currencyInfo(activeCurrency.code).prefix;

  const absolute = Math.abs(displayAmount);

  if (absolute >= 1_000_000) {
    return `${prefix}${(displayAmount / 1_000_000).toFixed(absolute >= 10_000_000 ? 0 : 1)}M`;
  }

  if (absolute >= 1_000) {
    return `${prefix}${(displayAmount / 1_000).toFixed(absolute >= 10_000 ? 0 : 1)}K`;
  }

  return `${prefix}${currencyFormatterWhole.format(displayAmount)}`;
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