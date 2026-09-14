import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseKey, supabaseUrl } from "../env";

/**
 * Supabase-klient til browseren.
 *
 * Nøglen er publishable og beregnet til at ligge offentligt — den giver kun
 * den adgang RLS tillader, og alle tabeller kræver et login.
 *
 * Biblioteket hentes med et dynamisk import, ikke øverst i filen. Det fylder
 * 253 kB ukomprimeret — mere end React — og lå før på den kritiske sti for
 * hver eneste side, selvom ingen side bruger det før efter første tegning:
 * loginsiden først når der trykkes log ind, appen først når realtime kobler
 * sig på, og Storage først når der uploades et billede. Nu ligger det i sin
 * egen fil som browseren henter ved siden af, i stedet for at skulle parse
 * det før siden bliver klikbar.
 *
 * Løftet gemmes, så klienten kun bygges én gang og filen kun hentes én gang,
 * uanset hvor mange steder der spørger.
 */
let pending: Promise<SupabaseClient> | null = null;

export function getSupabase(): Promise<SupabaseClient> {
  pending ??= import("@supabase/ssr").then(({ createBrowserClient }) =>
    createBrowserClient(supabaseUrl(), supabaseKey()),
  );
  return pending;
}

/**
 * Sætter hentningen i gang uden at vente på den.
 *
 * Bruges på sider hvor klienten skal bruges om et øjeblik alligevel — så
 * ligger filen klar når brugeren trykker, uden at have forsinket den første
 * tegning af siden.
 */
export function warmSupabase(): void {
  void getSupabase().catch(() => {
    // Fejler hentningen, prøver det rigtige kald igen og fortæller om det.
    pending = null;
  });
}
