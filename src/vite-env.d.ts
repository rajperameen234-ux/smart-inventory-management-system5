/**
 * Ambient types for Vite environment variables.
 * `vite/client` (already included via tsconfig "types") declares these
 * interfaces; this file merges the app-specific keys into them.
 */

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}