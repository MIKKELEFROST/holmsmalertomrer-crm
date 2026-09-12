import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase-klient til browseren.
 *
 * Nøglen her er publishable og beregnet til at ligge offentligt — den giver
 * kun den adgang RLS tillader, og alle tabeller kræver et login.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
