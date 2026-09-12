import { createBrowserClient } from "@supabase/ssr";
import { supabaseKey, supabaseUrl } from "../env";

/**
 * Supabase-klient til browseren.
 *
 * Nøglen her er publishable og beregnet til at ligge offentligt — den giver
 * kun den adgang RLS tillader, og alle tabeller kræver et login.
 */
export function createClient() {
  return createBrowserClient(supabaseUrl(), supabaseKey());
}
