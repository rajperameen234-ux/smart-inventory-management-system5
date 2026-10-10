/**
 * Date parsing / formatting helpers.
 *
 * Why this module exists:
 * `new Date("2026-01-01")` is parsed by the spec as **UTC** midnight, but is
 * then rendered in the **local** timezone. For any user at a negative UTC
 * offset that renders as "31 Dec 2025" — an off-by-one-day bug. Sales dates are
 * calendar dates, never instants, so date-only strings are parsed as local.
 */

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parse a value into a Date, treating `YYYY-MM-DD` as a local calendar date. */
export function parseDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "number") {
    const fromNumber = new Date(value);
    return Number.isNaN(fromNumber.getTime()) ? null : fromNumber;
  }

  const dateOnly = DATE_ONLY.exec(value.trim());

  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    const parsed = new Date(Number(year), Number(month) - 1, Number(day));

    if (Number.isNaN(parsed.getTime())) return null;

    // Reject impossible calendar dates that JS would silently roll over.
    if (
      parsed.getFullYear() !== Number(year) ||
      parsed.getMonth() !== Number(month) - 1 ||
      parsed.getDate() !== Number(day)
    ) {
      return null;
    }

    return parsed;
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Normalise any stored date value into the exact `YYYY-MM-DD` string that
 * `<input type="date">` requires. Without this, a timestamp like
 * `2026-01-01T00:00:00+00:00` silently renders as an empty date field.
 */
export function toDateInputValue(
  value: string | number | Date | null | undefined
): string {
  const parsed = parseDate(value);

  if (!parsed) return "";

  const year = String(parsed.getFullYear()).padStart(4, "0");
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/** Local-timezone "today" as `YYYY-MM-DD`. */
export function todayISODate(now: Date = new Date()): string {
  return toDateInputValue(now);
}

/** Human readable date in the user's locale, or an em dash when unparseable. */
export function formatDate(value: string | number | Date | null | undefined): string {
  const parsed = parseDate(value);

  if (!parsed) return "—";

  return parsed.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateShort(value: string | number | Date | null | undefined): string {
  const parsed = parseDate(value);

  if (!parsed) return "—";

  return parsed.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
  });
}

export function isValidDateInput(value: string): boolean {
  return parseDate(value) !== null;
}