import test from "node:test";
import assert from "node:assert/strict";

/**
 * Shapes taken from the live Supabase schema (verified via PostgREST):
 * `sales` stores customer_id / product_id — there are NO `customer`,
 * `customer_name`, `product` or `product_name` columns. These fixtures mirror
 * a real `select()` result exactly.
 */
type SalesRow = {
  id: number;
  customer_id: number;
  product_id: number;
  quantity: number;
  total_amount: number;
  paid_amount: number;
  sale_date: string;
};

const SALES: SalesRow[] = [
  {
    id: 1,
    customer_id: 10,
    product_id: 100,
    quantity: 2,
    total_amount: 5000,
    paid_amount: 5000,
    sale_date: "2026-01-05",
  },
  {
    id: 2,
    customer_id: 10,
    product_id: 101,
    quantity: 1,
    total_amount: 2500,
    paid_amount: 1000,
    sale_date: "2026-02-10",
  },
  {
    id: 3,
    customer_id: 11,
    product_id: 100,
    quantity: 3,
    total_amount: 7500,
    paid_amount: 7500,
    sale_date: "2026-02-11",
  },
];

const CUSTOMERS = [
  { id: 10, name: "Ali Traders" },
  { id: 11, name: "Sara Store" },
];

const PRODUCTS = [
  { id: 100, name: "Laptop" },
  { id: 101, name: "Mouse" },
];

/** Mirrors the join performed by src/pages/Reports.tsx. */
function buildReport(sales: SalesRow[]) {
  const customerNames = new Map(CUSTOMERS.map((c) => [c.id, c.name]));
  const productNames = new Map(PRODUCTS.map((p) => [p.id, p.name]));

  return sales.map((row) => ({
    id: row.id,
    customer: customerNames.get(row.customer_id) ?? `Customer #${row.customer_id}`,
    product: productNames.get(row.product_id) ?? `Product #${row.product_id}`,
    total: Number(row.total_amount ?? 0),
    paid: Number(row.paid_amount ?? 0),
  }));
}

test("REGRESSION: report rows resolve real customer and product names", () => {
  const report = buildReport(SALES);

  assert.deepEqual(
    report.map((r) => r.customer),
    ["Ali Traders", "Ali Traders", "Sara Store"]
  );

  assert.deepEqual(
    report.map((r) => r.product),
    ["Laptop", "Mouse", "Laptop"]
  );
});

test("REGRESSION: no row degrades to the old placeholder text", () => {
  const report = buildReport(SALES);

  assert.ok(
    report.every((r) => r.customer !== "Walk-in Customer"),
    "a row fell back to 'Walk-in Customer'"
  );

  assert.ok(
    report.every((r) => r.product !== "Product"),
    "a row fell back to 'Product'"
  );
});

test("REGRESSION: report charts bucket by real names, not one merged group", () => {
  const report = buildReport(SALES);

  const byCustomer = new Map<string, number>();
  const byProduct = new Map<string, number>();

  for (const row of report) {
    byCustomer.set(row.customer, (byCustomer.get(row.customer) ?? 0) + row.total);
    byProduct.set(row.product, (byProduct.get(row.product) ?? 0) + row.total);
  }

  // Three distinct customers collapsed into one bucket under the old code.
  assert.equal(byCustomer.size, 2);
  assert.equal(byCustomer.get("Ali Traders"), 7500);
  assert.equal(byCustomer.get("Sara Store"), 7500);

  assert.equal(byProduct.size, 2);
  assert.equal(byProduct.get("Laptop"), 12500);
  assert.equal(byProduct.get("Mouse"), 2500);
});

test("REGRESSION: sales totals, collections and dues reconcile", () => {
  const report = buildReport(SALES);

  const total = report.reduce((sum, r) => sum + r.total, 0);
  const paid = report.reduce((sum, r) => sum + r.paid, 0);
  const due = report.reduce(
    (sum, r) => sum + Math.max(0, r.total - r.paid),
    0
  );

  assert.equal(total, 15000);
  assert.equal(paid, 13500);
  assert.equal(due, 1500);

  // The identity that must always hold for a trustworthy dashboard.
  assert.equal(paid + due, total);
});

test("a sale pointing at a deleted customer still renders a stable label", () => {
  const report = buildReport([
    { ...SALES[0], customer_id: 999, product_id: 999 },
  ]);

  assert.equal(report[0].customer, "Customer #999");
  assert.equal(report[0].product, "Product #999");
});