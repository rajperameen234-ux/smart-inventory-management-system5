/**
 * Pure category helpers.
 *
 * Deliberately free of Supabase and React so the rules can be unit tested in
 * isolation. The data-fetching side lives in `./categoryStore.ts`.
 */

export type CategoryRecord = {
  id: number;
  name: string;
  description: string;
};

/**
 * Built-in options. The schema stores the category name directly in
 * `products.supplier`, so these names keep products created before the
 * Categories page was populated selectable.
 */
export const FALLBACK_CATEGORIES = [
  "Electronics",
  "Accessories",
  "Furniture",
  "Stationery",
  "Other",
];

/** Trim and collapse a category name; returns "" for unusable input. */
export function normalizeCategoryName(value: unknown): string {
  if (typeof value !== "string") return "";

  return value.trim().replace(/\s+/g, " ");
}

/**
 * Case-insensitive de-duplication that keeps the first occurrence, so
 * "Laptops" and "laptops" can never both appear in the same dropdown.
 */
export function dedupeByName<T extends { name: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const row of rows) {
    const key = normalizeCategoryName(row.name).toLowerCase();

    if (key.length === 0 || seen.has(key)) continue;

    seen.add(key);
    result.push(row);
  }

  return result;
}

/**
 * The option list for the Products category dropdown.
 *
 * Combines three sources so no existing value is ever lost:
 *   1. categories saved in the `categories` table
 *   2. names already used by products (keeps legacy rows selectable)
 *   3. the built-in fallbacks
 */
export function mergeCategoryOptions(input: {
  database: string[];
  inUse?: string[];
  fallback?: string[];
}): string[] {
  const merged = [
    ...input.database,
    ...(input.inUse ?? []),
    ...(input.fallback ?? FALLBACK_CATEGORIES),
  ]
    .map(normalizeCategoryName)
    .filter((name) => name.length > 0);

  return dedupeByName(merged.map((name) => ({ name })))
    .map((row) => row.name)
    .sort((a, b) => a.localeCompare(b));
}

/**
 * Find an existing category with the same name (case-insensitive).
 * `ignoreId` lets a category keep its own name while being edited.
 */
export function findDuplicateCategory(
  categories: CategoryRecord[],
  name: string,
  ignoreId?: number | null
): CategoryRecord | null {
  const target = normalizeCategoryName(name).toLowerCase();

  if (target.length === 0) return null;

  return (
    categories.find(
      (category) =>
        category.id !== ignoreId &&
        normalizeCategoryName(category.name).toLowerCase() === target
    ) ?? null
  );
}

/** The built-in options, exposed for tests and for the empty state. */
export function fallbackCategories(): string[] {
  return [...FALLBACK_CATEGORIES];
}