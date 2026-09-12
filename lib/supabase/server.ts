import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Supabase-klient til server components, server actions og route handlers.
 *
 * cookies() er asynkron fra Next.js 16, så klienten skal awaites.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Kaldt fra en server component, hvor cookies ikke kan sættes.
            // Sessionen fornyes i proxy.ts i stedet, så det er uden betydning.
          }
        },
      },
    },
  );
}
