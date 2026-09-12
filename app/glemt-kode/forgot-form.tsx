"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { AuthHeading, authButtonStyle, authInputStyle } from "@/components/auth-shell";

/**
 * Beder Supabase sende et nulstillingslink.
 *
 * Svaret er det samme uanset om mailen findes eller ikke: ellers kan man
 * bruge formularen til at finde ud af hvem der har adgang til systemet.
 */
export function ForgotForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const supabase = createClient();
      await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/callback?next=/ny-kode`,
      });
      // Fejl fra Supabase vises ikke: de ville afsløre om mailen findes.
      // Kun et reelt netværkssvigt er værd at fortælle om.
      setSent(true);
    } catch {
      setError("Ingen forbindelse. Tjek dit net og prøv igen.");
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <AuthHeading title="Tjek din mail" />
        <p
          style={{
            margin: 0,
            fontSize: 15,
            lineHeight: 1.55,
            color: "var(--color-navy-ink)",
            textWrap: "pretty",
          }}
        >
          Findes <strong>{email.trim()}</strong> i systemet, ligger der nu en
          mail med et link til at vælge en ny adgangskode. Linket kan kun
          bruges én gang og udløber efter en time.
        </p>
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--color-text-3)" }}>
          Kommer den ikke, så kig i spam. Er den stadig ikke der, er mailen
          formentlig ikke oprettet i systemet — kontakt den der har sat det op.
        </p>
        <Link
          href="/login"
          style={{
            ...authButtonStyle,
            display: "grid",
            placeItems: "center",
            textDecoration: "none",
          }}
        >
          Tilbage til login
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <AuthHeading title="Glemt adgangskode" />

      <p
        style={{
          margin: 0,
          fontSize: 14.5,
          lineHeight: 1.55,
          color: "var(--color-text-2)",
        }}
      >
        Skriv din e-mail, så sender vi et link til at vælge en ny.
      </p>

      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontSize: 12.5, color: "var(--color-text-3)" }}>E-mail</span>
        <input
          type="email"
          autoComplete="username"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={authInputStyle}
        />
      </label>

      {error ? (
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--color-danger)" }}>{error}</p>
      ) : null}

      <button type="submit" disabled={busy} style={{ ...authButtonStyle, opacity: busy ? 0.6 : 1 }}>
        {busy ? "Sender…" : "Send link"}
      </button>

      <Link
        href="/login"
        style={{
          fontSize: 13.5,
          color: "var(--color-link)",
          textAlign: "center",
          minHeight: 44,
          display: "grid",
          placeItems: "center",
        }}
      >
        Tilbage til login
      </Link>
    </form>
  );
}
