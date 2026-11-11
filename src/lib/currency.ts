/**
 * Currency utilities.
 *
 * Pure (no React, no Supabase) so the conversion rules can be unit tested
 * directly and shared by the formatter, the currency provider and every form.
 *
 * Core model: every monetary amount in the database is stored in the BASE
 * currency (PKR). A display currency is chosen per shopkeeper, and each
 * currency has ONE exchange rate expressed as "PKR per 1 unit of that
 * currency" (e.g. USD = 278.50 means 1 USD is worth 278.50 PKR).
 *
 * Conversion direction therefore is always:
 *   base  -> display : divide by the rate      (27,850 PKR / 278.50 = $100)
 *   display -> base  : multiply by the rate    ($100 * 278.50 = 27,850 PKR)
 *
 * Display-only math must never be converted again: formatters accept a value
 * already expressed in the base currency and convert exactly once; form values
 * typed in the display currency are converted back to base exactly once when
 * saving.
 */

export const BASE_CURRENCY = "PKR";

export type CurrencyCode = "PKR" | "USD" | "AED" | "SAR" | "GBP" | "EUR";

export type CurrencyInfo = {
  code: CurrencyCode;
  /** Text placed before the numeric amount, e.g. "Rs. " or "$". */
  prefix: string;
  /** Human label used in selectors, e.g. "USD - US Dollar". */
  label: string;
};

/** Every currency the switcher offers, in display order. */
export const SUPPORTED_CURRENCIES: CurrencyInfo[] = [
  { code: "PKR", prefix: "Rs. ", label: "PKR - Pakistani Rupee" },
  { code: "USD", prefix: "$", label: "USD - US Dollar" },
  { code: "AED", prefix: "AED ", label: "AED - UAE Dirham" },
  { code: "SAR", prefix: "SAR ", label: "SAR - Saudi Riyal" },
  { code: "GBP", prefix: "£", label: "GBP - British Pound" },
  { code: "EUR", prefix: "€", label: "EUR - Euro" },
];

const CURRENCY_BY_CODE = new Map(
  SUPPORTED_CURRENCIES.map((info) => [info.code, info])
);

export function currencyInfo(code: CurrencyCode): CurrencyInfo {
  return CURRENCY_BY_CODE.get(code) ?? SUPPORTED_CURRENCIES[0];
}

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === "string" && CURRENCY_BY_CODE.has(value as CurrencyCode);
}

/**
 * Exchange rates keyed by currency code, each expressed as the number of PKR
 * that one unit of the currency is worth (PKR per unit).
 */
export type CurrencyRates = Partial<Record<CurrencyCode, number>>;

/** A valid rate is a finite number greater than zero. */
export function isValidRate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/** Round to 2dp — the same money rounding the rest of the app uses. */
function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Resolve the effective "PKR per unit" rate for a currency.
 *
 * A manually entered rate always wins over the fetched one so the shopkeeper
 * can pin a rate they actually trade at. PKR is the base currency and always
 * resolves to exactly 1 (no conversion). Returns null when the selected
 * currency has no usable rate — callers must surface that, never guess.
 */
export function resolvePkrPerUnit(
  code: CurrencyCode,
  rates: CurrencyRates | null | undefined,
  manualRates: CurrencyRates | null | undefined = undefined
): number | null {
  if (code === BASE_CURRENCY) return 1;

  const manual = manualRates?.[code];
  if (isValidRate(manual)) return manual;

  const fetched = rates?.[code];
  if (isValidRate(fetched)) return fetched;

  return null;
}

/**
 * Convert an API rate map (1 PKR = apiRates[code]) into the app's internal
 * "PKR per unit" direction. Only supported currency codes are kept and every
 * entry is validated — an API returning 0, a negative value or garbage is
 * dropped rather than trusted.
 */
export function pkrPerUnitFromApiRates(
  apiRates: Record<string, unknown> | null | undefined
): CurrencyRates {
  const result: CurrencyRates = {};

  if (!apiRates) return result;

  for (const info of SUPPORTED_CURRENCIES) {
    if (info.code === BASE_CURRENCY) continue;

    const perPkr = Number(apiRates[info.code]);

    if (isValidRate(perPkr)) {
      result[info.code] = round2(1 / perPkr);
    }
  }

  return result;
}

/**
 * Base (PKR) -> display amount, rounded to 2dp for display.
 * Identity when the rate is 1 (PKR display) so stored values stay exact.
 */
export function convertFromPkr(pkrAmount: unknown, pkrPerUnit: number): number {
  const amount = Number(pkrAmount);

  if (!Number.isFinite(amount)) return 0;
  if (!isValidRate(pkrPerUnit) || pkrPerUnit === 1) return amount;

  return round2(amount / pkrPerUnit);
}

/**
 * Base (PKR) -> display amount with enough precision to round-trip through a
 * form field and back without corrupting the stored record (used when seeding
 * edit forms, NOT for display text).
 */
export function convertFromPkrPrecise(
  pkrAmount: unknown,
  pkrPerUnit: number
): number {
  const amount = Number(pkrAmount);

  if (!Number.isFinite(amount)) return 0;
  if (!isValidRate(pkrPerUnit) || pkrPerUnit === 1) return amount;

  return Number((amount / pkrPerUnit).toFixed(6));
}

/**
 * Display -> base (PKR) amount, rounded to the database's 2dp scale. Identity
 * when the rate is 1 so PKR entries are stored byte-for-byte as typed.
 */
export function convertToPkr(
  displayAmount: unknown,
  pkrPerUnit: number
): number {
  const amount = Number(displayAmount);

  if (!Number.isFinite(amount)) return 0;
  if (!isValidRate(pkrPerUnit) || pkrPerUnit === 1) return round2(amount);

  return round2(amount * pkrPerUnit);
}
