/**
 * Kontrol af miljøvariabler.
 *
 * Uden det her bliver symptomet på en manglende variabel en uforståelig fejl
 * inde fra Supabase-klienten — "Invalid URL" eller lignende — frem for en
 * besked der siger hvad der mangler og hvor det sættes.
 */

/**
 * Variablen skal sendes med som værdi, ikke slås op på navnet.
 *
 * Next.js erstatter `process.env.NEXT_PUBLIC_FOO` med selve værdien når
 * klient-bundtet bygges. Den erstatning sker kun på den bogstavelige skrivemåde
 * — et opslag som `process.env[name]` bliver ikke rørt, og variablen ville så
 * være undefined i browseren uanset om den er sat. Derfor to argumenter.
 */
export function requireEnv(name: string, value: string | undefined): string {
  if (value) return value;

  throw new Error(
    `Miljøvariablen ${name} mangler.\n\n` +
      `Sæt den i Vercel under Settings → Environment Variables og kør et nyt ` +
      `deploy. Variabler der begynder med NEXT_PUBLIC_ bages ind i koden når ` +
      `der bygges, så det er ikke nok at tilføje dem bagefter — der skal ` +
      `bygges om.\n\n` +
      `Lokalt sættes de i .env.local — se .env.example.`,
  );
}

/** Supabase-projektets URL. */
export const supabaseUrl = () =>
  requireEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);

/** Publishable key. Beregnet til at ligge offentligt; RLS styrer adgangen. */
export const supabaseKey = () =>
  requireEnv(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
