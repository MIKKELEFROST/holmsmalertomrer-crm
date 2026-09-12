import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Fornyer Supabase-sessionen på hver navigation og sender folk uden login
 * videre til /login.
 *
 * Filen hed middleware.ts indtil Next.js 16; konventionen er nu proxy.ts med
 * en eksporteret `proxy`-funktion.
 */

/** Ruter der må ses uden login. */
const PUBLIC_PATHS = ["/login", "/auth"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getClaims() validerer token'et. Kald altid noget her — det er kaldet der
  // fornyer sessionen, og uden det bliver folk logget ud af sig selv.
  const { data } = await supabase.auth.getClaims();

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );

  if (!data?.claims && !isPublic) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    // Husk hvor de var på vej hen, så de lander rigtigt efter login.
    if (pathname !== "/") {
      loginUrl.searchParams.set("next", pathname + request.nextUrl.search);
    }
    return NextResponse.redirect(loginUrl);
  }

  if (data?.claims && pathname === "/login") {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/";
    homeUrl.search = "";
    return NextResponse.redirect(homeUrl);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Alt undtagen statiske filer, billeder og intake-endpointet.
     * /api/leads/inbound har sin egen godkendelse med delt hemmelighed —
     * hjemmesideformularen har ingen brugersession at vise frem.
     */
    "/((?!_next/static|_next/image|favicon.ico|api/leads/inbound|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
