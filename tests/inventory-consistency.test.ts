import test from "node:test";
import assert from "node:assert/strict";

import {
  computeSaleStockEffects,
  computeLineTotals,
  resolveStockStatus,
  validateSale,
} from "../src/lib/inventory.ts";

/**
 * In-memory stand-in for the products + sales tables. It applies the exact
 * movements produced by `computeSaleStockEffects` — the same function the
 * Sales page uses — so these tests exercise production logic rather than a
 * reimplementation of it.
 */
class FakeDb {
  stock = new Map<number, number>();
  sales = new Map<number, { productId: number; quantity: number }>();
  nextSaleId = 1;

  seed(productId: number, quantity: number) {
    this.stock.set(productId, quantity);
  }

  /** Mirrors `applyStock()` in Sales.tsx. */
  async applyStock(productId: number, delta: number) {
    if (delta === 0) return;

    const current = this.stock.get(productId) ?? 0;
    this.stock.set(productId, Math.max(0, current + delta));
  }

  async applySaleStockEffects(input: {
    previous?: { productId: number; quantity: number } | null;
    nextProductId: number;
    nextQuantity: number;
    deleting?: boolean;
  }) {
    const movements = computeSaleStockEffects(input);

    for (const movement of movements) {
      await this.applyStock(movement.productId, movement.delta);
    }
  }

  async createSale(productId: number, quantity: number) {
    const id = this.nextSaleId++;

    this.sales.set(id, { productId, quantity });

    await this.applySaleStockEffects({
      previous: null,
      nextProductId: productId,
      nextQuantity: quantity,
    });

    return id;
  }

  async updateSale(saleId: number, productId: number, quantity: number) {
    const previous = this.sales.get(saleId);

    if (!previous) throw new Error(`Sale ${saleId} does not exist`);

    await this.applySaleStockEffects({
      previous,
      nextProductId: productId,
      nextQuantity: quantity,
    });

    this.sales.set(saleId, { productId, quantity });
  }

  async deleteSale(saleId: number) {
    const previous = this.sales.get(saleId);

    if (!previous) throw new Error(`Sale ${saleId} does not exist`);

    await this.applySaleStockEffects({
      previous,
      nextProductId: previous.productId,
      nextQuantity: previous.quantity,
      deleting: true,
    });

    this.sales.delete(saleId);
  }

  /** Units currently committed to sales for a product. */
  committed(productId: number) {
    let total = 0;

    for (const sale of this.sales.values()) {
      if (sale.productId === productId) total += sale.quantity;
    }

    return total;
  }
}

test("creating a sale decrements stock", async () => {
  const db = new FakeDb();

  db.seed(1, 10);

  await db.createSale(1, 3);

  assert.equal(db.stock.get(1), 7);
  assert.equal(db.committed(1), 3);
});

test("deleting a sale returns its units to stock", async () => {
  const db = new FakeDb();

  db.seed(1, 10);

  const id = await db.createSale(1, 3);

  assert.equal(db.stock.get(1), 7);

  await db.deleteSale(id);

  assert.equal(db.stock.get(1), 10, "stock was not restored on delete");
  assert.equal(db.committed(1), 0);
});

test("editing a sale quantity applies only the delta", async () => {
  const db = new FakeDb();

  db.seed(1, 10);

  const id = await db.createSale(1, 2);

  assert.equal(db.stock.get(1), 8);

  // 2 -> 5 : three more units leave stock.
  await db.updateSale(id, 1, 5);

  assert.equal(db.stock.get(1), 5);
  assert.equal(db.committed(1), 5);

  // 5 -> 1 : four units come back.
  await db.updateSale(id, 1, 1);

  assert.equal(db.stock.get(1), 9);
  assert.equal(db.committed(1), 1);
});

test("moving a sale to another product conserves total units", async () => {
  const db = new FakeDb();

  db.seed(1, 10);
  db.seed(2, 4);

  const id = await db.createSale(1, 3);

  assert.equal(db.stock.get(1), 7);

  await db.updateSale(id, 2, 3);

  assert.equal(db.stock.get(1), 10, "source product was not restored");
  assert.equal(db.stock.get(2), 1, "target product was not debited");
  assert.equal(db.committed(2), 3);
});

test("stock never goes negative even if data is corrupted", async () => {
  const db = new FakeDb();

  db.seed(1, 2);

  await db.createSale(1, 5);

  assert.equal(db.stock.get(1), 0);
  assert.ok((db.stock.get(1) ?? -1) >= 0);
});

test("REGRESSION: validation blocks the oversell that would go negative", () => {
  const issues = validateSale({
    customerId: "1",
    productId: "1",
    quantity: "5",
    totalAmount: "100",
    paidAmount: "0",
    date: "2026-03-15",
    availableStock: 2,
  });

  assert.equal(issues.length, 1);
  assert.match(issues[0].message, /Only 2 units in stock/);
});

test("REGRESSION: editing a sale may use the units it already holds", () => {
  // Product has 4 on hand and this sale already took 3, so it may claim up to
  // 4 without a false "insufficient stock" rejection.
  const available = 4 + 3;

  const issues = validateSale({
    customerId: "1",
    productId: "1",
    quantity: "4",
    totalAmount: "100",
    paidAmount: "0",
    date: "2026-03-15",
    availableStock: available,
  });

  assert.deepEqual(issues, []);
});

test("a full lifecycle leaves inventory and commitments consistent", async () => {
  const db = new FakeDb();

  db.seed(1, 20);

  const a = await db.createSale(1, 4);
  const b = await db.createSale(1, 6);

  assert.equal(db.stock.get(1), 10);
  assert.equal(db.committed(1), 10);

  await db.updateSale(a, 1, 8);

  assert.equal(db.stock.get(1), 6);
  assert.equal(db.committed(1), 14);

  await db.deleteSale(b);

  assert.equal(db.stock.get(1), 12);
  assert.equal(db.committed(1), 8);

  // The invariant: on-hand + committed always equals what we started with.
  assert.equal((db.stock.get(1) ?? 0) + db.committed(1), 20);
});

test("due amounts stay consistent through a full sale lifecycle", () => {
  assert.deepEqual(computeLineTotals(1000, 0), {
    total: 1000,
    paid: 0,
    due: 1000,
  });

  assert.deepEqual(computeLineTotals(1000, 1000), {
    total: 1000,
    paid: 1000,
    due: 0,
  });

  // Paid + due always equals the billed total, whatever the input.
  for (const [total, paid] of [
    [1000, 400],
    [99.99, 33.33],
    [0, 0],
    [1000000, 1],
  ] as [number, number][]) {
    const result = computeLineTotals(total, paid);

    assert.ok(
      Math.abs(result.paid + result.due - result.total) < 0.01,
      `${total}/${paid} did not reconcile`
    );
  }
});

test("low-stock status tracks the product's own threshold", () => {
  // A product with a threshold of 25 is "low" at 20, which the old
  // hardcoded `<= 10` check would have reported as healthy.
  assert.equal(resolveStockStatus(20, 25), "low");
  assert.equal(resolveStockStatus(11, 10), "healthy");
  assert.equal(resolveStockStatus(0, 25), "out");
});