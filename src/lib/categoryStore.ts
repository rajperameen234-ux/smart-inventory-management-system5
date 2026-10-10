import { supabase } from "../supabase.ts";
import type { CategoryRecord } from "./categories.ts";

/**
 * Categories are read by the Products page and written by the Categories page.
 * Those are separate components, so without a shared source of truth a
 * category created in one stays invisible to the other.
 *
 * This store keeps one cached list, coalesces concurrent loads into a single
 * request, and notifies subscribers whenever it changes so an open Products
 * form picks up a new category without a manual page refresh.
 */
let cache: CategoryRecord[] | null = null;
let inFlight: Promise<CategoryRecord[]> | null = null;

const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

/** Subscribe to cache invalidations. Returns an unsubscribe function. */
export function subscribeCategories(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Cached categories, or null when they have never been loaded. */
export function getCachedCategories(): CategoryRecord[] | null {
  return cache;
}

/**
 * Drop the cache and tell every subscriber to reload. Called after a category
 * is created, edited or deleted so other views refresh immediately.
 */
export function invalidateCategories(): void {
  cache = null;
  inFlight = null;
  notify();
}

/**
 * Fetch categories from Supabase, honouring the cache.
 *
 * Repeated calls share one in-flight request, so several components mounting
 * at once cannot produce duplicate network traffic.
 */
export type CategoryQueryResult = {
  data: { id: unknown; name: unknown; description: unknown }[] | null;
  error: { message: string } | null;
};

type CategoryFetcher = () => Promise<CategoryQueryResult>;

async function supabaseFetcher(): Promise<CategoryQueryResult> {
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, description")
    .order("id", { ascending: true });

  return { data, error };
}

let fetcher: CategoryFetcher = supabaseFetcher;

/**
 * Replaces the data source. Used by the unit tests to exercise caching,
 * coalescing and invalidation without a network round-trip.
 */
export function setCategoryFetcher(next: CategoryFetcher | null): void {
  fetcher = next ?? supabaseFetcher;
}

/**
 * Fetch categories, honouring the cache.
 *
 * Repeated calls share one in-flight request, so several components mounting
 * at once cannot produce duplicate network traffic.
 */
export async function loadCategories(
  options: { force?: boolean } = {}
): Promise<CategoryRecord[]> {
  if (cache && !options.force) return cache;
  if (inFlight) return inFlight;

  const request = (async () => {
    const { data, error } = await fetcher();

    if (error) throw new Error(error.message);

    const rows: CategoryRecord[] = (data ?? [])
      .map((row) => ({
        id: Number(row.id),
        name: String(row.name ?? "").trim(),
        description: String(row.description ?? ""),
      }))
      .filter((row) => row.name.length > 0);

    cache = rows;

    return rows;
  })();

  inFlight = request;

  try {
    const rows = await request;

    notify();

    return rows;
  } finally {
    if (inFlight === request) inFlight = null;
  }
}