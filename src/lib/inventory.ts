/**
 * Pure inventory / transaction business rules.
 *
 * Kept free of React and Supabase so the rules can be unit tested directly and
 * reused by the Dashboard, Sales page and Reports without divergence.
 */

import { parseDate } from "./date.ts";

export const DEFAULT_MINIMUM_STOCK = 10;

export type StockStatus = "out" | "low" | "healthy";

export type LineTotals = {
  total: number;
  paid: number;
  due: number;
};

export type ValidationIssue = {
  field: string;
  message: string;
};

/** Coerce anything to a finite number, defaulting to 0. */
export function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Normalise `due` so it can never be negative or exceed the billed total.
 * The database column is client supplied, so it is always recomputed.
 */
export function computeLineTotals(
  totalAmount: unknown,
  paidAmount: unknown
): LineTotals {
  const total = Math.max(0, toNumber(totalAmount));
  const paid = Math.min(Math.max(0, toNumber(paidAmount)), total);

  return { total, paid, due: roundMoney(total - paid) };
}

/** Round to 2dp to keep money arithmetic free of float drift (0.1+0.2). */
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Stock level classification.
 *
 * A single source of truth so the catalogue, dashboard and notification bell
 * can never disagree about what "low stock" means.
 */
export function resolveStockStatus(
  stock: unknown,
  minimumStock: unknown
): StockStatus {
  const quantity = toNumber(stock);
  const minimum = toNumber(minimumStock);

  if (quantity <= 0) return "out";

  // Fall back to the historical default when a product has no minimum set.
  const threshold = minimum > 0 ? minimum : DEFAULT_MINIMUM_STOCK;

  return quantity <= threshold ? "low" : "healthy";
}

export function resolveMinimumStock(minimumStock: unknown): number {
  const minimum = toNumber(minimumStock);
  return minimum > 0 ? minimum : DEFAULT_MINIMUM_STOCK;
}

export function isLowStock(stock: unknown, minimumStock: unknown): boolean {
  return resolveStockStatus(stock, minimumStock) !== "healthy";
}

/** Gross margin percentage, guarded against division by zero. */
export function computeMarginPercent(
  purchasePrice: unknown,
  sellingPrice: unknown
): number {
  const selling = toNumber(sellingPrice);

  if (selling <= 0) return 0;

  const purchase = toNumber(purchasePrice);

  return ((selling - purchase) / selling) * 100;
}

/** Total stock value at a given unit price. */
export function computeStockValue(stock: unknown, unitPrice: unknown): number {
  return roundMoney(toNumber(stock) * toNumber(unitPrice));
}

/** Cost of goods sold for a sale of `quantity` units at `unitCost`. */
export function computeCostOfGoods(
  quantity: unknown,
  unitCost: unknown
): number {
  return computeStockValue(quantity, unitCost);
}

/**
 * Validate a product payload before it is sent to the database.
 * Quantities must be whole numbers — fractional stock is not a thing.
 */
export function validateProduct(input: {
  name: string;
  quantity: string;
  purchasePrice: string;
  sellingPrice: string;
}): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!input.name.trim()) {
    issues.push({ field: "name", message: "Product name is required." });
  }

  const quantity = Number(input.quantity);

  if (input.quantity === "" || !Number.isFinite(quantity)) {
    issues.push({ field: "quantity", message: "Enter a valid quantity." });
  } else if (!Number.isInteger(quantity)) {
    issues.push({
      field: "quantity",
      message: "Quantity must be a whole number.",
    });
  } else if (quantity < 0) {
    issues.push({ field: "quantity", message: "Quantity cannot be negative." });
  }

  for (const [field, value, label] of [
    ["purchasePrice", input.purchasePrice, "Purchase price"],
    ["sellingPrice", input.sellingPrice, "Selling price"],
  ] as const) {
    const parsed = Number(value);

    if (value === "" || !Number.isFinite(parsed)) {
      issues.push({ field, message: `Enter a valid ${label.toLowerCase()}.` });
    } else if (parsed < 0) {
      issues.push({ field, message: `${label} cannot be negative.` });
    }
  }

  return issues;
}

/**
 * Validate a sale payload. `availableStock` is the product's current stock; the
 * new quantity is checked against it so stock can never go negative.
 */
export function validateSale(input: {
  customerId: string;
  productId: string;
  quantity: string;
  totalAmount: string;
  paidAmount: string;
  date: string;
  availableStock?: number;
}): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!input.customerId) {
    issues.push({ field: "customerId", message: "Please select a customer." });
  }

  if (!input.productId) {
    issues.push({ field: "productId", message: "Please select a product." });
  }

  const quantity = Number(input.quantity);

  if (input.quantity === "" || !Number.isFinite(quantity)) {
    issues.push({ field: "quantity", message: "Enter a valid quantity." });
  } else if (!Number.isInteger(quantity)) {
    issues.push({ field: "quantity", message: "Quantity must be a whole number." });
  } else if (quantity <= 0) {
    issues.push({ field: "quantity", message: "Quantity must be greater than 0." });
  } else if (
    input.availableStock !== undefined &&
    quantity > input.availableStock
  ) {
    issues.push({
      field: "quantity",
      message: `Only ${input.availableStock} unit${input.availableStock === 1 ? "" : "s"} in stock.`,
    });
  }

  const total = Number(input.totalAmount);

  if (input.totalAmount === "" || !Number.isFinite(total)) {
    issues.push({ field: "totalAmount", message: "Enter a total amount." });
  } else if (total <= 0) {
    issues.push({
      field: "totalAmount",
      message: "Total amount must be greater than 0.",
    });
  }

  const paid = input.paidAmount === "" ? 0 : Number(input.paidAmount);

  if (!Number.isFinite(paid) || paid < 0) {
    issues.push({ field: "paidAmount", message: "Paid amount cannot be negative." });
  } else if (Number.isFinite(total) && paid > total) {
    issues.push({
      field: "paidAmount",
      message: "Paid amount cannot exceed the total amount.",
    });
  }

  if (!input.date) {
    issues.push({ field: "date", message: "Select the sale date." });
  } else if (!parseDate(input.date)) {
    issues.push({ field: "date", message: "Sale date is not a valid date." });
  }

  return issues;
}

/**
 * Credit record status derived purely from the amounts, so the stored status
 * can never drift out of sync with the numbers.
 */
export function computeDueStatus(
  totalDue: unknown,
  paidAmount: unknown
): "Paid" | "Partial" | "Pending" {
  const total = toNumber(totalDue);
  const paid = toNumber(paidAmount);
  const remaining = roundMoney(total - paid);

  if (remaining <= 0) return "Paid";
  return paid > 0 ? "Partial" : "Pending";
}

/** Validate a dues payload. */
export function validateDue(input: {
  customerId: string;
  totalDue: string;
  paidAmount: string;
  dueDate: string;
}): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!input.customerId) {
    issues.push({ field: "customerId", message: "Please select a customer." });
  }

  const total = Number(input.totalDue);

  if (input.totalDue === "" || !Number.isFinite(total)) {
    issues.push({ field: "totalDue", message: "Enter a total due amount." });
  } else if (total <= 0) {
    issues.push({
      field: "totalDue",
      message: "Total due must be greater than 0.",
    });
  }

  const paid = input.paidAmount === "" ? 0 : Number(input.paidAmount);

  if (!Number.isFinite(paid) || paid < 0) {
    issues.push({ field: "paidAmount", message: "Paid amount cannot be negative." });
  } else if (Number.isFinite(total) && paid > total) {
    issues.push({
      field: "paidAmount",
      message: "Paid amount cannot exceed the total due.",
    });
  }

  if (!input.dueDate) {
    issues.push({ field: "dueDate", message: "Select the due date." });
  } else if (!parseDate(input.dueDate)) {
    issues.push({ field: "dueDate", message: "Due date is not a valid date." });
  }

  return issues;
}

/**
 * Stock movement for a sale write.
 *
 * Returns the signed change to apply to the product's stock. Selling
 * decrements (`-qty`), editing applies only the difference, and deleting
 * returns the units to stock.
 */
export function computeStockMovement(input: {
  previousQuantity?: number;
  nextQuantity?: number;
  deleting?: boolean;
}): number {
  if (input.deleting) return Math.abs(toNumber(input.previousQuantity));

  const previous = toNumber(input.previousQuantity);
  const next = toNumber(input.nextQuantity);

  return previous - next;
}

export type StockMovement = {
  productId: number;
  delta: number;
};

/**
 * All stock movements required to write a sale.
 *
 * This is the single source of truth for the stock side of a sale write, and
 * is used by both the Sales page and its unit tests:
 *
 * - new sale            -> debit the product by the quantity sold
 * - same product, edit  -> apply only the difference
 * - different product   -> fully restore the old product, fully debit the new
 * - delete              -> fully restore the product
 *
 * Getting the third case wrong (restoring but not debiting) silently inflates
 * total inventory, which is why it has its own regression test.
 */
export function computeSaleStockEffects(input: {
  previous?: { productId: number; quantity: number } | null;
  nextProductId: number;
  nextQuantity: number;
  deleting?: boolean;
}): StockMovement[] {
  const { previous, nextProductId, nextQuantity, deleting } = input;

  if (!previous) {
    return [
      {
        productId: nextProductId,
        delta: computeStockMovement({ nextQuantity }),
      },
    ];
  }

  const restore = computeStockMovement({
    previousQuantity: previous.quantity,
    deleting: true,
  });

  if (deleting) {
    return [{ productId: previous.productId, delta: restore }];
  }

  if (previous.productId === nextProductId) {
    return [
      {
        productId: nextProductId,
        delta: computeStockMovement({
          previousQuantity: previous.quantity,
          nextQuantity,
        }),
      },
    ];
  }

  return [
    { productId: previous.productId, delta: restore },
    {
      productId: nextProductId,
      delta: computeStockMovement({ nextQuantity }),
    },
  ];
}

/**
 * Aggregate a list of rows by a key. Used for the top-products and
 * top-customers reports, which previously bucketed everything into one row
 * because the join was missing.
 */
export function aggregateBy<T>(
  rows: T[],
  key: (row: T) => string | number | null | undefined,
  value: (row: T) => number
): Map<string, number> {
  const totals = new Map<string, number>();

  rows.forEach((row) => {
    const rawKey = key(row);
    const label =
      rawKey === null || rawKey === undefined || rawKey === ""
        ? "Unknown"
        : String(rawKey);

    totals.set(label, (totals.get(label) ?? 0) + toNumber(value(row)));
  });

  return totals;
}

/** Rank aggregated totals descending and limit the result. */
export function topEntries(
  totals: Map<string, number>,
  limit = 5
): { label: string; value: number }[] {
  return Array.from(totals.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

/** Map a numeric id to a display name, with a stable fallback. */
export function resolveName(
  lookup: Map<number, string>,
  id: unknown,
  fallbackPrefix: string
): string {
  const key = toNumber(id);
  const found = lookup.get(key);

  return found ?? `${fallbackPrefix} #${id}`;
}