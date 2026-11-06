/**
 * Pure profit / finance rules.
 *
 * Free of React and Supabase so the rules can be unit tested directly and
 * shared by the Profit page, Dashboard and Credit & Dues without divergence.
 *
 * Core principle: profit for a sale is always calculated from the unit prices
 * frozen against that sale (historical unit price / unit cost), never from a
 * product's current prices, which may change later.
 */

import { roundMoney, toNumber } from "./inventory.ts";
import { parseDate, todayISODate } from "./date.ts";

/* -------------------------------------------------------------------------- */
/*  Per-sale profit                                                            */
/* -------------------------------------------------------------------------- */

export type ProfitSale = {
  quantity: unknown;
  /** Final amount after discount, as recorded on the sale. */
  totalAmount: unknown;
  /**
   * Historical purchase cost per unit, frozen at the time of the sale.
   * Legacy rows before the migration may have null — callers decide the
   * fallback (for example the product's snapshot cost backfilled at
   * migration time).
   */
  unitCost: unknown;
  discount?: unknown;
};

export type SaleProfit = {
  units: number;
  /** Final billed amount (after discount). */
  finalAmount: number;
  costOfGoods: number;
  /** finalAmount − costOfGoods. Unpaid dues still count as earned profit. */
  grossProfit: number;
};

/**
 * Gross profit for a single sale.
 *
 * The sale's unit_cost is frozen when the sale is written, so this must never
 * be fed the product's *current* purchase price.
 */
export function computeSaleProfit(input: ProfitSale): SaleProfit {
  const units = toNumber(input.quantity);
  const finalAmount = roundMoney(toNumber(input.totalAmount));
  const costOfGoods = roundMoney(toNumber(input.unitCost) * units);

  return {
    units,
    finalAmount,
    costOfGoods,
    grossProfit: roundMoney(finalAmount - costOfGoods),
  };
}

/** Profit per unit sold, from historical prices frozen on the sale. */
export function computeUnitProfit(
  unitCost: unknown,
  unitPrice: unknown
): number {
  return roundMoney(toNumber(unitPrice) - toNumber(unitCost));
}

/**
 * Aggregate profit sums across a list of sales. Values are rounded per sale
 * and then summed, so every number the UI shows reconciles row by row.
 */
export function sumsSalesProfit<
  T extends ProfitSale & { paidAmount?: unknown },
>(sales: T[]): {
  billed: number;
  collected: number;
  costOfGoods: number;
  grossProfit: number;
  units: number;
} {
  let billed = 0;
  let collected = 0;
  let costOfGoods = 0;
  let units = 0;

  sales.forEach((sale) => {
    const profit = computeSaleProfit(sale);

    billed += profit.finalAmount;
    collected += toNumber(sale.paidAmount);
    costOfGoods += profit.costOfGoods;
    units += profit.units;
  });

  return {
    billed: roundMoney(billed),
    collected: roundMoney(collected),
    costOfGoods: roundMoney(costOfGoods),
    grossProfit: roundMoney(billed - costOfGoods),
    units,
  };
}

/* -------------------------------------------------------------------------- */
/*  Date ranges                                                                */
/* -------------------------------------------------------------------------- */

export type RangePreset =
  | "today"
  | "yesterday"
  | "last7"
  | "thisMonth"
  | "lastMonth"
  | "all"
  | "custom";

export type DateRange = {
  /** Inclusive `YYYY-MM-DD`, or null for "all time". */
  start: string | null;
  /** Inclusive `YYYY-MM-DD`, or null for "all time". */
  end: string | null;
};

function toISO(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function addDays(base: Date, days: number): Date {
  return new Date(
    base.getFullYear(),
    base.getMonth(),
    base.getDate() + days
  );
}

/**
 * Resolve a preset (or custom bounds) into an inclusive date range.
 *
 * All presets are built from *local* calendar days so a user in any timezone
 * gets the day they actually mean. Return null bounds for "all time"; a
 * custom range only resolves when both dates parse as real calendars dates
 * (2026-02-31 is rejected, never silently rolled over).
 */
export function resolveDateRange(
  preset: RangePreset,
  custom?: { start: string; end: string },
  now: Date = new Date()
): DateRange {

  switch (preset) {
    case "today":
      return { start: todayISODate(now), end: todayISODate(now) };

    case "yesterday": {
      const y = addDays(now, -1);
      const time = toISO(y);

      return { start: time, end: time };
    }

    case "last7": {
      const end = todayISODate(now);
      const start = toISO(addDays(now, -6));

      return { start, end };
    }

    case "thisMonth":
      return {
        start: toISO(new Date(now.getFullYear(), now.getMonth(), 1)),
        end: todayISODate(now),
      };

    case "lastMonth":
      return {
        start: toISO(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        end: toISO(new Date(now.getFullYear(), now.getMonth(), 0)),
      };

    case "all":
      return { start: null, end: null };

    case "custom": {
      const start = parseDate(custom?.start ?? "");
      const end = parseDate(custom?.end ?? "");

      if (!start || !end) return { start: null, end: null };

      const startISO = toISO(start);
      const endISO = toISO(end);

      // Swap rather than silently return nothing when the user inverts them.
      return startISO <= endISO
        ? { start: startISO, end: endISO }
        : { start: endISO, end: startISO };
    }

    default:
      return { start: null, end: null };
  }
}

/** True when a sale date falls inside the inclusive range (or range is open). */
export function dateInRange(
  saleDate: string | null | undefined,
  range: DateRange
): boolean {
  if (!range.start && !range.end) return true;

  const parsed = parseDate(saleDate);

  if (!parsed) return false;

  const day = toISO(parsed);
  const parsedStart = range.start ? parseDate(range.start) : null;
  const parsedEnd = range.end ? parseDate(range.end) : null;

  const startDay = parsedStart ? toISO(parsedStart) : null;
  const endDay = parsedEnd ? toISO(parsedEnd) : null;

  if (startDay && day < startDay) return false;
  if (endDay && day > endDay) return false;

  return true;
}

/* -------------------------------------------------------------------------- */
/*  Series builders                                                            */
/* -------------------------------------------------------------------------- */

export type ProfitPoint = { label: string; amount: number; key: string };

/**
 * Daily profit / sales series for the last `days` calendar days, inclusive of
 * today. Every day in the window is present (zero-filled) so charts show the
 * actual rhythm of the business.
 */
export function buildDailySeries(
  rows: { amount: unknown; date: string | null | undefined }[],
  days = 14,
  now: Date = new Date()
): ProfitPoint[] {
  const today = now;
  const points: ProfitPoint[] = [];

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = addDays(today, -offset);
    const key = toISO(day);

    points.push({
      key,
      label: day.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
      }),
      amount: 0,
    });
  }

  const index = new Map(points.map((point, i) => [point.key, i]));

  rows.forEach((row) => {
    const parsed = parseDate(row.date);

    if (!parsed) return;

    const position = index.get(toISO(parsed));

    if (position !== undefined) {
      points[position].amount = roundMoney(
        points[position].amount + toNumber(row.amount)
      );
    }
  });

  return points;
}

/* -------------------------------------------------------------------------- */
/*  Payment allocation (FIFO)                                                  */
/* -------------------------------------------------------------------------- */

export type PaymentApplication = {
  saleId: number;
  amount: number;
};

export type PaymentAllocation = {
  applications: PaymentApplication[];
  /** Whatever could not be applied because open sales ran out. */
  unallocated: number;
};

/**
 * Spread a payment across a customer's open sales, oldest (lowest id) first.
 *
 * Used by the client-side fallback when the database RPC is unavailable.
 * Over-paying is refused up front by the callers; this helper just stops at
 * zero and reports anything it could not apply.
 */
export function allocatePayment(
  openSales: { id: number; dueAmount: unknown }[],
  amount: unknown
): PaymentAllocation {
  let remaining = roundMoney(toNumber(amount));
  const applications: PaymentApplication[] = [];

  for (const sale of openSales) {
    if (remaining <= 0.009) break;

    const due = roundMoney(toNumber(sale.dueAmount));

    if (due <= 0.009) continue;

    const applied = roundMoney(Math.min(remaining, due));

    applications.push({ saleId: sale.id, amount: applied });
    remaining = roundMoney(remaining - applied);
  }

  return {
    applications,
    // Nothing left over: a payment must be validated against the balance first.
    unallocated: Math.max(remaining, 0),
  };
}

/* -------------------------------------------------------------------------- */
/*  Statuses                                                                   */
/* -------------------------------------------------------------------------- */

export type PaymentStatus = "Paid" | "Partial" | "Unpaid";

/** Payment status derived from actual amounts, never from a stored label. */
export function computePaymentStatus(
  totalAmount: unknown,
  paidAmount: unknown
): PaymentStatus {
  const total = roundMoney(toNumber(totalAmount));
  const paid = roundMoney(Math.min(toNumber(paidAmount), total));
  const due = roundMoney(total - paid);

  if (due <= 0) return "Paid";

  return paid > 0 ? "Partial" : "Unpaid";
}
