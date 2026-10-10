import test from "node:test";
import assert from "node:assert/strict";

import {
  invalidateCategories,
  loadCategories,
  setCategoryFetcher,
  subscribeCategories,
} from "../src/lib/categoryStore.ts";

/**
 * These exercise the real category store with a stubbed data source, proving
 * the behaviour that makes a newly created category reach the Products page:
 * caching, request coalescing and invalidation.
 */

let dbRows: { id: number; name: string; description: string }[] = [];
let fetches = 0;
let failWith: string | null = null;
let notifications = 0;

function stubFetcher() {
  setCategoryFetcher(async () => {
    fetches += 1;

    if (failWith) return { data: null, error: { message: failWith } };

    return { data: dbRows.map((row) => ({ ...row })), error: null };
  });
}

function reset() {
  dbRows = [];
  fetches = 0;
  failWith = null;
  notifications = 0;
  setCategoryFetcher(null);
  invalidateCategories();
}

test.beforeEach(reset);
test.afterEach(() => setCategoryFetcher(null));

test("loads categories from the data source", async () => {
  stubFetcher();

  dbRows = [
    { id: 1, name: "Laptops", description: "" },
    { id: 2, name: "Tablets", description: "" },
  ];

  const rows = await loadCategories();

  assert.equal(fetches, 1);
  assert.deepEqual(rows.map((r) => r.name), ["Laptops", "Tablets"]);
});

test("REGRESSION: a second caller reuses the cache instead of refetching", async () => {
  stubFetcher();

  dbRows = [{ id: 1, name: "Laptops", description: "" }];

  const first = await loadCategories();
  const second = await loadCategories();

  assert.equal(fetches, 1, "cache was not used");
  assert.deepEqual(first, second);
});

test("REGRESSION: concurrent loads are coalesced into one request", async () => {
  stubFetcher();

  dbRows = [{ id: 1, name: "Laptops", description: "" }];

  const [a, b, c] = await Promise.all([
    loadCategories(),
    loadCategories(),
    loadCategories(),
  ]);

  assert.equal(fetches, 1, "duplicate requests were issued");
  assert.deepEqual(a, b);
  assert.deepEqual(b, c);
});

test("REGRESSION: invalidation makes a newly created category visible", async () => {
  stubFetcher();

  dbRows = [{ id: 1, name: "Laptops", description: "" }];

  await loadCategories();
  assert.deepEqual((await loadCategories()).map((r) => r.name), ["Laptops"]);

  // The Categories page saves a new row, then publishes the change.
  dbRows = [
    { id: 1, name: "Laptops", description: "" },
    { id: 2, name: "Monitors", description: "" },
  ];

  invalidateCategories();

  const refreshed = await loadCategories();

  assert.equal(fetches, 2, "stale cache was served after invalidation");
  assert.ok(
    refreshed.some((row) => row.name === "Monitors"),
    "the new category did not appear"
  );
});

test("force reload bypasses a warm cache", async () => {
  stubFetcher();

  dbRows = [{ id: 1, name: "Laptops", description: "" }];

  await loadCategories();
  await loadCategories({ force: true });

  assert.equal(fetches, 2);
});

test("subscribers are notified on load and on invalidation", async () => {
  stubFetcher();

  const unsubscribe = subscribeCategories(() => {
    notifications += 1;
  });

  dbRows = [{ id: 1, name: "Laptops", description: "" }];

  await loadCategories();
  assert.ok(notifications > 0, "no notification after a load");

  const afterLoad = notifications;

  invalidateCategories();
  assert.ok(notifications > afterLoad, "no notification after invalidation");

  unsubscribe();

  const afterUnsubscribe = notifications;

  invalidateCategories();
  assert.equal(notifications, afterUnsubscribe, "unsubscribe did not detach");
});

test("a failing load throws and leaves no poisoned cache", async () => {
  stubFetcher();

  failWith = "permission denied for table categories";

  await assert.rejects(() => loadCategories(), /permission denied/);

  failWith = null;
  dbRows = [{ id: 1, name: "Laptops", description: "" }];

  const rows = await loadCategories();

  assert.deepEqual(rows.map((r) => r.name), ["Laptops"]);
});

test("rows with a blank name are discarded", async () => {
  stubFetcher();

  dbRows = [
    { id: 1, name: "Laptops", description: "" },
    { id: 2, name: "   ", description: "blank" },
    { id: 3, name: "", description: "empty" },
  ];

  const rows = await loadCategories();

  assert.deepEqual(rows.map((r) => r.name), ["Laptops"]);
});

test("names are trimmed so the dropdown is clean", async () => {
  stubFetcher();

  dbRows = [{ id: 1, name: "  Laptops  ", description: "" }];

  assert.deepEqual((await loadCategories())[0].name, "Laptops");
});