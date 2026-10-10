import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  dedupeByName,
  fallbackCategories,
  findDuplicateCategory,
  mergeCategoryOptions,
  normalizeCategoryName,
  type CategoryRecord,
} from "../src/lib/categories.ts";

const PRODUCTS_SOURCE = readFileSync(
  join(process.cwd(), "src", "pages", "Products.tsx"),
  "utf8"
);

const CATEGORIES_SOURCE = readFileSync(
  join(process.cwd(), "src", "pages", "Categories.tsx"),
  "utf8"
);

const STORE_SOURCE = readFileSync(
  join(process.cwd(), "src", "lib", "categoryStore.ts"),
  "utf8"
);

/* -------------------------------------------------------------------------- */
/*  normalize                                                                  */
/* -------------------------------------------------------------------------- */

test("normalizeCategoryName trims and collapses whitespace", () => {
  assert.equal(normalizeCategoryName("  Laptops  "), "Laptops");
  assert.equal(normalizeCategoryName("Home   Office"), "Home Office");
  assert.equal(normalizeCategoryName("\tTablets\n"), "Tablets");
  assert.equal(normalizeCategoryName(""), "");
  assert.equal(normalizeCategoryName("   "), "");
  assert.equal(normalizeCategoryName(null), "");
  assert.equal(normalizeCategoryName(undefined), "");
  assert.equal(normalizeCategoryName(42), "");
});

/* -------------------------------------------------------------------------- */
/*  dedupe                                                                     */
/* -------------------------------------------------------------------------- */

test("dedupeByName removes case-insensitive duplicates, keeping the first", () => {
  const rows = [
    { id: 1, name: "Laptops" },
    { id: 2, name: "laptops" },
    { id: 3, name: "  LAPTOPS " },
    { id: 4, name: "Tablets" },
  ];

  assert.deepEqual(
    dedupeByName(rows).map((row) => row.name),
    ["Laptops", "Tablets"]
  );
});

test("dedupeByName drops blank names", () => {
  const rows = [{ id: 1, name: "   " }, { id: 2, name: "Real" }];

  assert.deepEqual(
    dedupeByName(rows).map((row) => row.name),
    ["Real"]
  );
});

/* -------------------------------------------------------------------------- */
/*  merge                                                                      */
/* -------------------------------------------------------------------------- */

test("REGRESSION: a category saved in the database appears in the options", () => {
  // The bug: Products built its list from a hardcoded array only, so a
  // category created in the Categories section never appeared here.
  const options = mergeCategoryOptions({
    database: ["Laptops", "Tablets"],
  });

  assert.ok(options.includes("Laptops"), "database category was dropped");
  assert.ok(options.includes("Tablets"), "database category was dropped");
});

test("REGRESSION: built-in fallbacks are still present", () => {
  const options = mergeCategoryOptions({ database: ["Laptops"] });

  for (const fallback of fallbackCategories()) {
    assert.ok(options.includes(fallback), `${fallback} missing`);
  }
});

test("REGRESSION: names already used by products stay selectable", () => {
  // Legacy rows store their category name in products.supplier. Those values
  // must never vanish from the dropdown.
  const options = mergeCategoryOptions({
    database: ["Laptops"],
    inUse: ["Legacy Segment", "Another One"],
  });

  assert.ok(options.includes("Legacy Segment"));
  assert.ok(options.includes("Another One"));
});

test("merge de-duplicates case-insensitively across all three sources", () => {
  const options = mergeCategoryOptions({
    database: ["Laptops", "TABLETS"],
    inUse: ["laptops", "Legacy"],
    fallback: ["Laptops", "Stationery"],
  });

  const lowered = options.map((item) => item.toLowerCase());

  assert.equal(new Set(lowered).size, options.length, "duplicates survived");
  assert.equal(lowered.filter((n) => n === "laptops").length, 1);
  assert.equal(lowered.filter((n) => n === "tablets").length, 1);
});

test("merge preserves the first spelling encountered", () => {
  const options = mergeCategoryOptions({
    database: ["Laptops"],
    inUse: ["laptops"],
  });

  assert.ok(options.includes("Laptops"));
  assert.ok(!options.includes("laptops"));
});

test("merge drops blank entries and returns a sorted list", () => {
  const options = mergeCategoryOptions({
    database: ["", "  ", "Zebra"],
    inUse: ["Apple"],
    fallback: [],
  });

  assert.deepEqual(options, ["Apple", "Zebra"]);
});

/* -------------------------------------------------------------------------- */
/*  duplicate prevention                                                       */
/* -------------------------------------------------------------------------- */

const EXISTING: CategoryRecord[] = [
  { id: 1, name: "Laptops", description: "" },
  { id: 2, name: "Tablets", description: "" },
];

test("findDuplicateCategory detects an exact repeat", () => {
  assert.equal(findDuplicateCategory(EXISTING, "Laptops")?.id, 1);
});

test("findDuplicateCategory ignores case and padding", () => {
  assert.equal(findDuplicateCategory(EXISTING, "  laptops ")?.id, 1);
  assert.equal(findDuplicateCategory(EXISTING, "TABLETS")?.id, 2);
});

test("findDuplicateCategory allows a category to keep its own name when edited", () => {
  // Editing "Laptops" without renaming must not report itself a duplicate.
  assert.equal(findDuplicateCategory(EXISTING, "Laptops", 1), null);
});

test("findDuplicateCategory returns null for a genuinely new name", () => {
  assert.equal(findDuplicateCategory(EXISTING, "Monitors"), null);
  assert.equal(findDuplicateCategory(EXISTING, "   "), null);
});

/* -------------------------------------------------------------------------- */
/*  Source-level guarantees                                                    */
/* -------------------------------------------------------------------------- */

test("REGRESSION: the categories table is actually queried", () => {
  // The query lives in the shared store that the Products page consumes.
  assert.match(
    STORE_SOURCE,
    /\.from\("categories"\)/,
    "the categories table must be queried"
  );

  assert.match(
    STORE_SOURCE,
    /\.select\("id, name, description"\)/,
    "id and name must both be selected"
  );

  assert.match(
    PRODUCTS_SOURCE,
    /loadCategories\(/,
    "Products must load categories through the store"
  );
});

test("REGRESSION: the store caches and invalidates so both screens stay in sync", () => {
  assert.match(STORE_SOURCE, /let cache: CategoryRecord\[\] \| null/);
  assert.match(STORE_SOURCE, /export function invalidateCategories/);
  assert.match(STORE_SOURCE, /export function subscribeCategories/);
  assert.match(STORE_SOURCE, /if \(inFlight\) return inFlight/, "loads must be coalesced");
});

test("REGRESSION: the Products dropdown no longer uses a hardcoded-only list", () => {
  assert.ok(
    !/const BASE_CATEGORIES = \[/.test(PRODUCTS_SOURCE),
    "the hardcoded BASE_CATEGORIES list must be gone from Products"
  );

  assert.match(
    PRODUCTS_SOURCE,
    /mergeCategoryOptions\(\{/,
    "Products must build options from database categories"
  );
});

test("REGRESSION: products still store the category name in supplier", () => {
  // The schema keeps the category name in products.supplier; switching to
  // category_id would blank every existing product.
  assert.match(
    PRODUCTS_SOURCE,
    /supplier:\s*category/,
    "products must keep writing the category name to supplier"
  );
});

test("REGRESSION: creating a category publishes the change", () => {
  assert.match(
    CATEGORIES_SOURCE,
    /invalidateCategories\(\)/,
    "Categories must invalidate the shared cache after a write"
  );
});

test("REGRESSION: duplicate categories are blocked before writing", () => {
  assert.match(
    CATEGORIES_SOURCE,
    /findDuplicateCategory\(/,
    "Categories must check for an existing duplicate name"
  );

  assert.match(
    CATEGORIES_SOURCE,
    /Duplicate category/,
    "a duplicate must surface a clear message"
  );
});

test("REGRESSION: both screens subscribe to category changes", () => {
  for (const [name, source] of [
    ["Products", PRODUCTS_SOURCE],
    ["Categories", CATEGORIES_SOURCE],
  ]) {
    assert.match(
      source,
      /subscribeCategories\(/,
      `${name} must subscribe to category changes`
    );
  }
});

test("REGRESSION: Products reports category loading and error states", () => {
  assert.match(PRODUCTS_SOURCE, /categoriesLoading/);
  assert.match(PRODUCTS_SOURCE, /categoriesError/);
  assert.match(
    PRODUCTS_SOURCE,
    /Categories could not be loaded/,
    "a category load failure must be surfaced"
  );
});