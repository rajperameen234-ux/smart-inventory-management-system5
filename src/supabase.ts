import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  "https://hfzeyxsceowgncvjbsnn.supabase.co";

const supabaseAnonKey = "sb_publishable_6-4vwO7nPNxgEs6DnPeNXg_FqZrovs3";

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey
);