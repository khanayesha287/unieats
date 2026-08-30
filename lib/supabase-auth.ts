import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "";

/**
 * Auth-enabled Supabase client with cookie-based session persistence.
 * Uses createBrowserClient from @supabase/ssr so that session cookies
 * are shared between the browser client and the Next.js middleware.
 * Separate from the main `supabase` client to avoid
 * affecting existing order-related operations.
 */
export const supabaseAuth =
  supabaseUrl && supabaseKey
    ? createBrowserClient(supabaseUrl, supabaseKey)
    : null;
