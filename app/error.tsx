"use client";

import { useEffect } from "react";

/**
 * Fejlgrænse for hele appen.
 *
 * Fanger blandt andet at databasen ikke svarer — uden den her får man Next.js'
 * rå fejlside, som hverken siger hvad der er galt eller hvad man kan gøre.
 * Meick skal kunne se forskel på "jeg har intet net" og "systemet er nede",
 * for i det første tilfælde hjælper det at køre op ad kældertrappen.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Ender i Vercels logs, hvor den kan slås op på digest.
    console.error("Appen fejlede:", error);
  }, [error]);

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: 20,
        background: "var(--color-navy)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "var(--color-surface)",
          borderRadius: 16,
          padding: 28,
        }}
      >
        <p
          style={{
            margin: 0,
            fontFamily: "var(--font-display)",
            fontSize: 11.5,
            fontWeight: 800,
            letterSpacing: ".16em",
            textTransform: "uppercase",
            color: "var(--color-text-3)",
          }}
        >
          Holms Maler &amp; Tømrer ApS
        </p>

        <h1
          style={{
            margin: "8px 0 0",
            fontFamily: "var(--font-display)",
            fontSize: 24,
            fontWeight: 700,
            lineHeight: 1.2,
          }}
        >
          Kunne ikke hente leads
        </h1>

        <p
          style={{
            margin: "10px 0 0",
            fontSize: 15,
            lineHeight: 1.55,
            color: "var(--color-navy-ink)",
            textWrap: "pretty",
          }}
        >
          Systemet kunne ikke få fat i databasen. Tjek først om du har
          forbindelse — er du i en kælder eller et område med dårligt signal,
          er det som regel forklaringen.
        </p>

        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: 20,
            width: "100%",
            minHeight: 52,
            borderRadius: "var(--radius-btn)",
            background: "var(--color-yellow)",
            color: "var(--color-navy)",
            fontFamily: "var(--font-display)",
            fontSize: 16,
            fontWeight: 700,
          }}
        >
          Prøv igen
        </button>

        {error.digest ? (
          <p
            style={{
              margin: "16px 0 0",
              fontSize: 11.5,
              color: "var(--color-text-4)",
              textAlign: "center",
            }}
          >
            Bliver den ved, så oplys denne kode: {error.digest}
          </p>
        ) : null}
      </div>
    </main>
  );
}
