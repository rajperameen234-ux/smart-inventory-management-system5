import test from "node:test";
import assert from "node:assert/strict";

import {
  allocatePayment,
  buildDailySeries,
  computePaymentStatus,
  computeSaleProfit,
  computeUnitProfit,
  dateInRange,
  resolveDateRange,
  sumsSalesProfit,
} from "../src/lib/profit.ts";

/* -------------------------------------------------------------------------- */
/*  Per-sale profit                                                            */
/* -------------------------------------------------------------------------- */

test("computeSaleProfit: gross profit uses the cost frozen at sale time", () => {
  // Spec example: cost 500, selling 750, qty 3 → COGS 1500, billed 2250.
  const result = computeSaleProfit({
    quantity: 3,
    totalAmount: 2250,
    unitCost: 500,
  });

  assert.equal(result.costOfGoods, 1500);
  assert.equal(result.grossProfit, 750);
  assert.equal(result.units, 3);
});

test("computeSaleProfit: discount is applied in the billed final amount", () => {
  // Spec example: purchase cost 1500, final after discount 2000 → gross 500.
  const result = computeSaleProfit({
    quantity: 3,
    totalAmount: 2000,
    unitCost: 500,
    discount: 250,
  });

  assert.equal(result.finalAmount, 2000);
  assert.equal(result.costOfGoods, 1500);
  assert.equal(result.grossProfit, 500);
});

test("computeSaleProfit: unpaid dues still count as earned profit", () => {
  // A completed credit sale earns its profit even before it is collected.
  const result = computeSaleProfit({
    quantity: 1,
    totalAmount: 750,
    unitCost: 500,
  });

  assert.equal(result.grossProfit, 250);
});

test("computeUnitProfit uses historical per-unit prices", () => {
  assert.equal(computeUnitProfit(500, 750), 250);
  assert.equal(computeUnitProfit(null, 750), 750);
  assert.equal(computeUnitProfit("abc", 750), 750);
});

test("sumsSalesProfit aggregates without double counting", () => {
  const totals = sumsSalesProfit([
    { quantity: 3, totalAmount: 2250, unitCost: 500, paidAmount: 1200 },
    { quantity: 1, totalAmount: 750, unitCost: 500, paidAmount: 0 },
  ]);

  assert.equal(totals.billed, 3000);
  assert.equal(totals.collected, 1200);
  assert.equal(totals.costOfGoods, 2000);
  assert.equal(totals.grossProfit, 1000);
  assert.equal(totals.units, 4);
});

/* -------------------------------------------------------------------------- */
/*  Date ranges                                                                */
/* -------------------------------------------------------------------------- */

test("resolveDateRange: yesterday covers exactly one calendar day", () => {
  const range = resolveDateRange("yesterday", undefined, new Date(2026, 2, 15));

  assert.equal(range.start, "2026-03-14");
  assert.equal(range.end, "2026-03-14");
});

test("resolveDateRange: last7 includes today", () => {
  const range = resolveDateRange("last7", undefined, new Date(2026, 2, 15));

  assert.equal(range.start, "2026-03-09");
  assert.equal(range.end, "2026-03-15");
});

test("resolveDateRange: this month and previous month boundaries", () => {
  const thisMonth = resolveDateRange("thisMonth", undefined, new Date(2026, 2, 15));

  assert.equal(thisMonth.start, "2026-03-01");
  assert.equal(thisMonth.end, "2026-03-15");

  const lastMonth = resolveDateRange("lastMonth", undefined, new Date(2026, 2, 15));

  // February 2026 has 28 days.
  assert.equal(lastMonth.start, "2026-02-01");
  assert.equal(lastMonth.end, "2026-02-28");
});

test("resolveDateRange: custom range swaps inverted dates instead of failing", () => {
  const range = resolveDateRange("custom", {
    start: "2026-03-10",
    end: "2026-03-01",
  }, new Date(2026, 2, 15));

  assert.equal(range.start, "2026-03-01");
  assert.equal(range.end, "2026-03-10");
});

test("resolveDateRange: impossible custom dates resolve to an open range", () => {
  const range = resolveDateRange("custom", {
    start: "2026-02-31",
    end: "2026-03-10",
  }, new Date(2026, 2, 15));

  assert.equal(range.start, null);
  assert.equal(range.end, null);
});

test("resolveDateRange: 'all' resolves to an open range", () => {
  assert.deepEqual(resolveDateRange("all"), { start: null, end: null });
});

test("dateInRange filters with inclusive bounds and open ends", () => {
  const range = { start: "2026-03-01", end: "2026-03-10" };

  assert.equal(dateInRange("2026-03-01", range), true);
  assert.equal(dateInRange("2026-03-10", range), true);
  assert.equal(dateInRange("2026-03-11", range), false);
  assert.equal(dateInRange("2026-02-28", range), false);

  // A full-format timestamp on the right day is inside the range.
  assert.equal(dateInRange("2026-03-05T00:00:00+00:00", range), true);

  // Open ranges and unparseable dates.
  assert.equal(dateInRange("2026-03-05", { start: null, end: null }), true);
  assert.equal(dateInRange("not-a-date", range), false);
});

/* -------------------------------------------------------------------------- */
/*  Daily series                                                               */
/* -------------------------------------------------------------------------- */

test("buildDailySeries zero-fills the window and sums per day", () => {
  // Fixed "now" so the window is deterministic: 13/14/15 March 2026.
  const series = buildDailySeries(
    [
      { amount: 100, date: "2026-03-15" },
      { amount: 250, date: "2026-03-15" },
      { amount: 500, date: "2026-03-14" },
      { amount: 999, date: "2020-01-01" },
    ],
    3,
    new Date(2026, 2, 15)
  );

  assert.deepEqual(
    series.map((point) => point.key),
    ["2026-03-13", "2026-03-14", "2026-03-15"]
  );

  assert.deepEqual(
    series.map((point) => point.amount),
    [0, 500, 350],
    "outside-window rows are ignored, per-day amounts are summed"
  );
});

/* -------------------------------------------------------------------------- */
/*  Payment allocation                                                         */
/* -------------------------------------------------------------------------- */

test("allocatePayment spreads FIFO across open sales", () => {
  const result = allocatePayment(
    [
      { id: 1, dueAmount: 2000 },
      { id: 2, dueAmount: 3000 },
    ],
    4000
  );

  assert.deepEqual(result.applications, [
    { saleId: 1, amount: 2000 },
    { saleId: 2, amount: 2000 },
  ]);
  assert.equal(result.unallocated, 0);
});

test("allocatePayment: already-settled and zero-due sales are skipped", () => {
  const result = allocatePayment(
    [
      { id: 1, dueAmount: 0 },
      { id: 2, dueAmount: 100 },
    ],
    100
  );

  assert.deepEqual(result.applications, [{ saleId: 2, amount: 100 }]);
  assert.equal(result.unallocated, 0);
});

test("allocatePayment reports what could not be applied", () => {
  const result = allocatePayment([{ id: 1, dueAmount: 500 }], 1000);

  assert.deepEqual(result.applications, [{ saleId: 1, amount: 500 }]);
  assert.equal(result.unallocated, 500);
});

/* -------------------------------------------------------------------------- */
/*  Payment status                                                             */
/* -------------------------------------------------------------------------- */

test("computePaymentStatus derives Paid / Partial / Unpaid", () => {
  // Spec examples: full, partial (3000 of 5000) and credit sale.
  assert.equal(computePaymentStatus(5000, 5000), "Paid");
  assert.equal(computePaymentStatus(5000, 3000), "Partial");
  assert.equal(computePaymentStatus(5000, 0), "Unpaid");
  assert.equal(computePaymentStatus(0, 0), "Paid");
});

test("computePaymentStatus tolerates messy numeric input", () => {
  assert.equal(computePaymentStatus("5000", "1000"), "Partial");
  assert.equal(computePaymentStatus(null, null), "Paid");
  assert.equal(computePaymentStatus(1000, 9999), "Paid");
});
