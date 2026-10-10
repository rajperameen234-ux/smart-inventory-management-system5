import test from "node:test";
import assert from "node:assert/strict";

import {
  aggregateBy,
  computeCostOfGoods,
  computeDueStatus,
  computeLineTotals,
  computeMarginPercent,
  computeStockMovement,
  computeStockValue,
  DEFAULT_MINIMUM_STOCK,
  isLowStock,
  resolveMinimumStock,
  resolveName,
  resolveStockStatus,
  roundMoney,
  toNumber,
  topEntries,
  validateDue,
  validateProduct,
  validateSale,
} from "../src/lib/inventory.ts";

/* -------------------------------------------------------------------------- */
/*  toNumber                                                                   */
/* -------------------------------------------------------------------------- */

test("toNumber coerces database values safely", () => {
  assert.equal(toNumber(42), 42);
  assert.equal(toNumber("42"), 42);
  assert.equal(toNumber("12.5"), 12.5);
  assert.equal(toNumber(null), 0);
  assert.equal(toNumber(undefined), 0);
  assert.equal(toNumber(""), 0);
  assert.equal(toNumber("abc"), 0);
  assert.equal(toNumber(Number.NaN), 0);
  assert.equal(toNumber(Number.POSITIVE_INFINITY), 0);
});

/* -------------------------------------------------------------------------- */
/*  Money                                                                      */
/* -------------------------------------------------------------------------- */

test("roundMoney removes float drift", () => {
  assert.equal(roundMoney(0.1 + 0.2), 0.3);
  assert.equal(roundMoney(1.005), 1.01);
  assert.equal(roundMoney(10 / 3), 3.33);
});

test("computeLineTotals derives due from total and paid", () => {
  assert.deepEqual(computeLineTotals(1000, 400), {
    total: 1000,
    paid: 400,
    due: 600,
  });

  assert.deepEqual(computeLineTotals(1000, 1000), {
    total: 1000,
    paid: 1000,
    due: 0,
  });

  assert.deepEqual(computeLineTotals(999.99, 0), {
    total: 999.99,
    paid: 0,
    due: 999.99,
  });
});

test("computeLineTotals never produces a negative or over-collected due", () => {
  // Floating point must not leak a 1e-14 into the stored due amount.
  const result = computeLineTotals(0.3, 0.1);

  assert.equal(result.due, 0.2);
  assert.ok(result.due >= 0);

  // Over-payment is clamped, never turned into negative credit.
  assert.deepEqual(computeLineTotals(100, 150), {
    total: 100,
    paid: 100,
    due: 0,
  });

  assert.deepEqual(computeLineTotals(-50, 0), {
    total: 0,
    paid: 0,
    due: 0,
  });

  assert.deepEqual(computeLineTotals(100, -20), {
    total: 100,
    paid: 0,
    due: 100,
  });
});

/* -------------------------------------------------------------------------- */
/*  Stock status — one source of truth                                         */
/* -------------------------------------------------------------------------- */

test("resolveStockStatus classifies stock consistently", () => {
  assert.equal(resolveStockStatus(0, 10), "out");
  assert.equal(resolveStockStatus(-3, 10), "out");
  assert.equal(resolveStockStatus(10, 10), "low");
  assert.equal(resolveStockStatus(4, 10), "low");
  assert.equal(resolveStockStatus(11, 10), "healthy");
  assert.equal(resolveStockStatus(500, 10), "healthy");
});

test("resolveStockStatus falls back to the default minimum when unset", () => {
  // Matches the legacy hardcoded threshold so existing rows keep their meaning.
  assert.equal(DEFAULT_MINIMUM_STOCK, 10);
  assert.equal(resolveStockStatus(10, null), "low");
  assert.equal(resolveStockStatus(10, 0), "low");
  assert.equal(resolveStockStatus(11, undefined), "healthy");
  assert.equal(resolveMinimumStock(null), 10);
  assert.equal(resolveMinimumStock(25), 25);
});

test("isLowStock matches resolveStockStatus", () => {
  assert.equal(isLowStock(0, 5), true);
  assert.equal(isLowStock(5, 5), true);
  assert.equal(isLowStock(6, 5), false);
});

test("stock value and cost of goods use correct unit prices", () => {
  assert.equal(computeStockValue(10, 250), 2500);
  assert.equal(computeStockValue(3, 99.99), 299.97);
  assert.equal(computeStockValue(null, 100), 0);
  assert.equal(computeCostOfGoods(4, 125), 500);
});

test("computeMarginPercent uses selling price as the denominator", () => {
  assert.equal(computeMarginPercent(75, 100), 25);
  assert.equal(computeMarginPercent(100, 100), 0);
  assert.equal(computeMarginPercent(150, 100), -50);
  // Guards divide-by-zero when a product has no selling price yet.
  assert.equal(computeMarginPercent(100, 0), 0);
});

/* -------------------------------------------------------------------------- */
/*  Stock movement                                                             */
/* -------------------------------------------------------------------------- */

test("computeStockMovement decrements stock on insert", () => {
  assert.equal(computeStockMovement({ nextQuantity: 3 }), -3);
});

test("computeStockMovement restores stock when a sale is deleted", () => {
  assert.equal(computeStockMovement({ previousQuantity: 3, deleting: true }), 3);
});

test("computeStockMovement applies only the delta when a sale is edited", () => {
  // 2 -> 5 means three more units left stock.
  assert.equal(computeStockMovement({ previousQuantity: 2, nextQuantity: 5 }), -3);
  // 5 -> 2 means two units came back.
  assert.equal(computeStockMovement({ previousQuantity: 5, nextQuantity: 2 }), 3);
  // No change means no movement.
  assert.equal(computeStockMovement({ previousQuantity: 4, nextQuantity: 4 }), 0);
});

/* -------------------------------------------------------------------------- */
/*  Product validation                                                         */
/* -------------------------------------------------------------------------- */

test("validateProduct accepts a well-formed product", () => {
  const issues = validateProduct({
    name: "Keyboard",
    quantity: "12",
    purchasePrice: "500",
    sellingPrice: "900",
  });

  assert.deepEqual(issues, []);
});

test("REGRESSION: validateProduct rejects fractional quantities", () => {
  const issues = validateProduct({
    name: "Cable",
    quantity: "2.5",
    purchasePrice: "50",
    sellingPrice: "90",
  });

  assert.equal(issues.length, 1);
  assert.equal(issues[0].field, "quantity");
  assert.match(issues[0].message, /whole number/i);
});

test("validateProduct rejects missing and negative values", () => {
  const issues = validateProduct({
    name: "   ",
    quantity: "-4",
    purchasePrice: "-1",
    sellingPrice: "",
  });

  const fields = issues.map((issue) => issue.field);

  assert.ok(fields.includes("name"));
  assert.ok(fields.includes("quantity"));
  assert.ok(fields.includes("purchasePrice"));
  assert.ok(fields.includes("sellingPrice"));
});

/* -------------------------------------------------------------------------- */
/*  Sale validation                                                            */
/* -------------------------------------------------------------------------- */

test("validateSale accepts a valid sale", () => {
  const issues = validateSale({
    customerId: "1",
    productId: "2",
    quantity: "3",
    totalAmount: "3000",
    paidAmount: "2000",
    date: "2026-03-15",
    availableStock: 10,
  });

  assert.deepEqual(issues, []);
});

test("REGRESSION: validateSale blocks selling more than is in stock", () => {
  const issues = validateSale({
    customerId: "1",
    productId: "2",
    quantity: "11",
    totalAmount: "100",
    paidAmount: "0",
    date: "2026-03-15",
    availableStock: 10,
  });

  assert.equal(issues.length, 1);
  assert.equal(issues[0].field, "quantity");
  assert.match(issues[0].message, /in stock/i);
});

test("validateSale rejects fractional and non-positive quantities", () => {
  const fractional = validateSale({
    customerId: "1",
    productId: "2",
    quantity: "1.5",
    totalAmount: "10",
    paidAmount: "0",
    date: "2026-03-15",
  });

  assert.match(fractional[0].message, /whole number/i);

  const zero = validateSale({
    customerId: "1",
    productId: "2",
    quantity: "0",
    totalAmount: "10",
    paidAmount: "0",
    date: "2026-03-15",
  });

  assert.match(zero[0].message, /greater than 0/i);
});

test("validateSale rejects over-payment and bad dates", () => {
  const overpaid = validateSale({
    customerId: "1",
    productId: "2",
    quantity: "1",
    totalAmount: "100",
    paidAmount: "150",
    date: "2026-03-15",
  });

  assert.equal(overpaid[0].field, "paidAmount");

  const badDate = validateSale({
    customerId: "1",
    productId: "2",
    quantity: "1",
    totalAmount: "100",
    paidAmount: "0",
    date: "2026-02-31",
  });

  assert.equal(badDate[0].field, "date");
});

test("validateSale requires customer and product", () => {
  const issues = validateSale({
    customerId: "",
    productId: "",
    quantity: "1",
    totalAmount: "10",
    paidAmount: "0",
    date: "2026-03-15",
  });

  assert.deepEqual(
    issues.map((issue) => issue.field).sort(),
    ["customerId", "productId"]
  );
});

/* -------------------------------------------------------------------------- */
/*  Dues                                                                       */
/* -------------------------------------------------------------------------- */

test("computeDueStatus is derived from the amounts", () => {
  assert.equal(computeDueStatus(1000, 1000), "Paid");
  assert.equal(computeDueStatus(1000, 400), "Partial");
  assert.equal(computeDueStatus(1000, 0), "Pending");
  assert.equal(computeDueStatus(1000, 1200), "Paid");
  assert.equal(computeDueStatus(0, 0), "Paid");
});

test("validateDue rejects over-payment and missing dates", () => {
  const issues = validateDue({
    customerId: "",
    totalDue: "100",
    paidAmount: "200",
    dueDate: "",
  });

  const fields = issues.map((issue) => issue.field).sort();

  assert.deepEqual(fields, ["customerId", "dueDate", "paidAmount"]);
});

/* -------------------------------------------------------------------------- */
/*  Aggregation — the Reports bug                                              */
/* -------------------------------------------------------------------------- */

test("REGRESSION: aggregateBy buckets rows by their real joined name", () => {
  // Previously every sale row collapsed into a single "Walk-in Customer"
  // bucket because the customer name was never joined.
  const rows = [
    { customer: "Ali", amount: 100 },
    { customer: "Ali", amount: 250 },
    { customer: "Sara", amount: 400 },
  ];

  const totals = aggregateBy(rows, (row) => row.customer, (row) => row.amount);

  assert.equal(totals.size, 2);
  assert.equal(totals.get("Ali"), 350);
  assert.equal(totals.get("Sara"), 400);
});

test("aggregateBy labels missing keys as Unknown rather than colliding", () => {
  const totals = aggregateBy(
    [{ name: null, amount: 10 }, { name: undefined, amount: 5 }, { name: "Ali", amount: 1 }],
    (row) => row.name,
    (row) => row.amount
  );

  assert.equal(totals.size, 2);
  assert.equal(totals.get("Unknown"), 15);
  assert.equal(totals.get("Ali"), 1);
});

test("topEntries ranks descending and limits", () => {
  const totals = new Map([
    ["a", 10],
    ["b", 50],
    ["c", 30],
  ]);

  assert.deepEqual(topEntries(totals, 2), [
    { label: "b", value: 50 },
    { label: "c", value: 30 },
  ]);
});

test("resolveName falls back to a stable label for missing rows", () => {
  const lookup = new Map([[1, "Ali"]]);

  assert.equal(resolveName(lookup, 1, "Customer"), "Ali");
  assert.equal(resolveName(lookup, 99, "Customer"), "Customer #99");
  assert.equal(resolveName(lookup, null, "Product"), "Product #null");
});