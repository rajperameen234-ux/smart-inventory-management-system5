import { createClient } from "@supabase/supabase-js";

/**
 * Supabase browser client.
 *
 * Configuration is read from Vite env vars when present so the project can be
 * pointed at a different project without touching source. The published values
 * below are the *publishable* (anon) key — safe to ship to a browser by design
 * and paired with Row Level Security. Never put a secret/service-role key here.
 */
/**
 * `import.meta.env` only exists under Vite. The optional chain keeps this
 * module importable from plain Node (unit tests, scripts) where it is absent,
 * falling back to the committed values.
 */
const env = (import.meta as { env?: Record<string, string | undefined> }).env;

const supabaseUrl =
  env?.VITE_SUPABASE_URL ?? "https://hfzeyxsceowgncvjbsnn.supabase.co";

const supabaseAnonKey =
  env?.VITE_SUPABASE_ANON_KEY ??
  "sb_publishable_6-4vwO7nPNxgEs6DnPeNXg_FqZrovs3";

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export const SUPABASE_PROJECT_URL = supabaseUrl;

/** Returns the authenticated user's id, or null when signed out. */
export async function getCurrentUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Attach the current user's id to every row of an insert payload.
 *
 * Every table carries a `user_id` column, so populating it keeps records
 * attributable to their owner and lets `user_id = auth.uid()` Row Level
 * Security policies keep working. Rows are left untouched when signed out so
 * inserts never break with a null owner.
 */
export async function withOwner<T extends Record<string, unknown>>(
  rows: T[]
): Promise<(T & { user_id?: string })[]> {
  const userId = await getCurrentUserId();

  if (!userId) return rows;

  return rows.map((row) => ({ ...row, user_id: userId }));
}

export type InsertResult<T> = {
  data: (T & { id?: unknown }) | null;
  error: { message: string } | null;
};

/**
 * Insert that automatically stamps `user_id`.
 *
 * If the column rejects the value (a project without it, or a differently
 * typed column) the insert is retried without it so a schema difference can
 * never block a legitimate save.
 */
export async function insertOwned<T extends Record<string, unknown>>(
  table: string,
  rows: T[]
): Promise<InsertResult<T>> {
  const owned = await withOwner(rows);

  const first = (await supabase
    .from(table)
    .insert(owned)
    .select()
    .single()) as unknown as InsertResult<T>;

  if (!first.error) return first;

  const message = first.error.message.toLowerCase();
  const ownerRejected =
    message.includes("user_id") ||
    message.includes("user id") ||
    message.includes("column");

  if (!ownerRejected || !("user_id" in owned[0])) return first;

  const retryRows = owned.map((row) => {
    const copy = { ...row } as Record<string, unknown>;
    delete copy.user_id;
    return copy;
  });

  return (await supabase
    .from(table)
    .insert(retryRows)
    .select()
    .single()) as unknown as InsertResult<T>;
}