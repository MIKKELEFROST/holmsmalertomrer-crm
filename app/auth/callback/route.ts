import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Landingspunkt for links fra Supabase — i praksis "glemt adgangskode".
 *
 * Linket giver ikke en session i sig selv; det skal veksles først. Supabase
 * sender enten en `code` (PKCE, som er standard for browser-klienten) eller
 * et `token_hash`, afhængigt af hvordan mailskabelonen er sat op. Begge
 * håndteres, så flowet ikke knækker den dag skabelonen bliver rettet.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;

  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  // Hvor brugeren skal hen bagefter. Kun interne stier, så et manipuleret
  // link ikke kan sende nogen videre til et fremmed domæne.
  const rawNext = searchParams.get("next") ?? "/ny-kode";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//")
    ? rawNext
    : "/ny-kode";

  const supabase = await createClient();

  let failed: string | null = null;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) failed = error.message;
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (error) failed = error.message;
  } else {
    failed = "Linket mangler oplysninger";
  }

  if (failed) {
    console.error("Kunne ikke indløse link fra Supabase:", failed);
    // Links udløber, og de kan kun bruges én gang. Sig det frem for at
    // sende folk tilbage til en tom loginskærm uden forklaring.
    const url = new URL("/login", origin);
    url.searchParams.set("fejl", "link");
    return NextResponse.redirect(url);
  }

  return NextResponse.redirect(new URL(next, origin));
}
