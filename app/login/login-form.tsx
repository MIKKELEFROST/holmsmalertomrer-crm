"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabase, warmSupabase } from "@/lib/supabase/client";

/**
 * Login med e-mail og adgangskode.
 *
 * Der er ingen selvbetjent oprettelse: brugere oprettes i Supabase-
 * dashboardet. Det er et internt system for én virksomhed, og enhver der
 * kan logge ind kan se alle kundedata.
 */
export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  // /auth/callback sender hertil med ?fejl=link når et nulstillingslink er
  // udløbet eller allerede brugt.
  const [error, setError] = useState<string | null>(
    searchParams.get("fejl") === "link"
      ? "Linket er udløbet eller allerede brugt. Bed om et nyt nedenfor."
      : null,
  );

  // Hent Supabase-biblioteket mens der tastes, ikke før siden er tegnet.
  // Så ligger det klar når der trykkes log ind, uden at have forsinket noget.
  useEffect(() => {
    warmSupabase();
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    let signInError;
    try {
      // Hentningen af biblioteket ligger med inde i try'en. Fejler den —
      // mistet net midt i det — skal knappen ikke stå og sige "Logger ind…"
      // for evigt uden at fortælle hvorfor.
      const supabase = await getSupabase();
      ({ error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      }));
    } catch {
      setError("Ingen forbindelse. Tjek dit net og prøv igen.");
      setBusy(false);
      return;
    }

    if (signInError) {
      // Skeln mellem "du skrev forkert" og "systemet svarer ikke". Sender man
      // altid det første, går Meick og prøver adgangskoder i ti minutter mens
      // problemet i virkeligheden er at databasen er nede.
      const badCredentials =
        signInError.code === "invalid_credentials" ||
        signInError.status === 400;

      setError(
        badCredentials
          ? // Sig ikke om det var mailen eller kodeordet der var forkert.
            "Forkert e-mail eller adgangskode"
          : "Systemet svarer ikke lige nu. Prøv igen om lidt.",
      );
      setBusy(false);
      return;
    }

    const next = searchParams.get("next");
    router.replace(next && next.startsWith("/") ? next : "/");
    router.refresh();
  };

  return (
    <form
      onSubmit={submit}
      style={{
        width: "100%",
        maxWidth: 380,
        background: "var(--color-surface)",
        borderRadius: 16,
        padding: 28,
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <div>
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
            margin: "6px 0 0",
            fontFamily: "var(--font-display)",
            fontSize: 26,
            fontWeight: 700,
            lineHeight: 1.15,
          }}
        >
          Log ind
        </h1>
      </div>

      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontSize: 12.5, color: "var(--color-text-3)" }}>E-mail</span>
        <input
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={inputStyle}
        />
      </label>

      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontSize: 12.5, color: "var(--color-text-3)" }}>
          Adgangskode
        </span>
        <input
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={inputStyle}
        />
      </label>

      {error ? (
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--color-danger)" }}>
          {error}
        </p>
      ) : null}

      <Link
        href="/glemt-kode"
        style={{
          fontSize: 13.5,
          color: "var(--color-link)",
          minHeight: 44,
          display: "flex",
          alignItems: "center",
          marginTop: -6,
        }}
      >
        Glemt adgangskode?
      </Link>

      <button
        type="submit"
        disabled={busy}
        style={{
          minHeight: 52,
          borderRadius: "var(--radius-btn)",
          background: "var(--color-yellow)",
          color: "var(--color-navy)",
          fontFamily: "var(--font-display)",
          fontSize: 16,
          fontWeight: 700,
          opacity: busy ? 0.6 : 1,
        }}
      >
        {busy ? "Logger ind…" : "Log ind"}
      </button>
    </form>
  );
}

const inputStyle: React.CSSProperties = {
  background: "var(--color-card)",
  border: "1px solid var(--color-line-input)",
  borderRadius: "var(--radius-input)",
  padding: "12px 13px",
  fontSize: 16,
  minHeight: 48,
};
