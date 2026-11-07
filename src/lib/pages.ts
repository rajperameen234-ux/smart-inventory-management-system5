/**
 * Pure hash-router parsing.
 *
 * Kept free of React and Supabase so node --test can exercise it directly.
 * `navigation.ts` (which pulls in icons) re-exports from here for the app.
 */

/** Every page id the app can render, including the reset-password screen. */
export const PAGES = [
  "dashboard",
  "products",
  "categories",
  "suppliers",
  "customers",
  "sales",
  "dues",
  "profit",
  "reports",
  "settings",
  "reset-password",
] as const;

export type PageId = (typeof PAGES)[number];

export const DEFAULT_PAGE: PageId = "dashboard";

/** True when the string is a page the app renders. */
export function isPageId(value: string): value is PageId {
  return (PAGES as readonly string[]).includes(value);
}

/**
 * Resolve a location hash to a page.
 *
 * A Supabase recovery/magic-link callback appends a SECOND "#" fragment to
 * whatever URL the email pointed at:
 *
 *   /#/reset-password#access_token=...&refresh_token=...
 *
 * Only the first segment is a router page; the token fragment must be
 * discarded, otherwise the parser falls back to the dashboard and the reset
 * form is unreachable. An unknown or missing page resolves to the default.
 */
export function parsePageFromHash(
  value: string | null | undefined
): PageId {
  const raw = (value ?? "").replace(/^#\/?/, "").trim();

  const page = raw.split("#")[0] ?? "";

  if (isPageId(page)) return page;

  return DEFAULT_PAGE;
}
