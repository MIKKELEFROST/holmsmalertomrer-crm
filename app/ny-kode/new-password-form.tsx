"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase/client";
import { AuthHeading, authButtonStyle, authInputStyle } from "@/components/auth-shell";

/** Kortere end det her er ikke en adgangskode, det er en gæt-mig-leg. */
const MIN_LAENGDE = 10;

/**
 * Sætter en ny adgangskode.
 *
 * Man lander her fra linket i mailen, som allerede har givet en session via
 * /auth/callback. Derfor spørges der ikke om den gamle kode — den er jo
 * netop glemt.
 */
export function NewPasswordForm() {
  const router = useRouter();
  const [kode, setKode] = useState("");
  const [gentag, setGentag] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [harSession, setHarSession] = useState<boolean | null>(null);

  // Uden en session er linket udløbet eller allerede brugt. Sig det med det
  // samme frem for at lade folk skrive en kode der ikke kan gemmes.
  useEffect(() => {
    let aktiv = true;
    getSupabase()
      .then((supabase) => supabase.auth.getSession())
      .then(({ data }) => {
        if (aktiv) setHarSession(Boolean(data.session));
      })
      .catch(() => {
        if (aktiv) setHarSession(false);
      });
    return () => {
      aktiv = false;
    };
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (kode.length < MIN_LAENGDE) {
      setError(`Adgangskoden skal være mindst ${MIN_LAENGDE} tegn`);
      return;
    }
    if (kode !== gentag) {
      setError("De to koder er ikke ens");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const supabase = await getSupabase();
      const { error: updateError } = await supabase.auth.updateUser({
        password: kode,
      });

      if (updateError) {
        setError(
          updateError.message.toLowerCase().includes("session")
            ? "Linket er udløbet. Bed om et nyt."
            : "Kunne ikke gemme den nye adgangskode. Prøv igen.",
        );
        setBusy(false);
        return;
      }
    } catch {
      setError("Ingen forbindelse. Tjek dit net og prøv igen.");
      setBusy(false);
      return;
    }

    router.replace("/");
    router.refresh();
  };

  if (harSession === false) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <AuthHeading title="Linket virker ikke" />
        <p
          style={{
            margin: 0,
            fontSize: 15,
            lineHeight: 1.55,
            color: "var(--color-navy-ink)",
            textWrap: "pretty",
          }}
        >
          Det er enten brugt før eller udløbet. Links til nulstilling kan kun
          bruges én gang.
        </p>
        <Link
          href="/glemt-kode"
          style={{ ...authButtonStyle, display: "grid", placeItems: "center", textDecoration: "none" }}
        >
          Bed om et nyt link
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <AuthHeading title="Vælg ny adgangskode" />

      <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.55, color: "var(--color-text-2)" }}>
        Mindst {MIN_LAENGDE} tegn. Flere almindelige ord med bindestreg mellem
        er både nemmere at taste på en telefon og sværere at gætte end noget
        kort med tegnsalat.
      </p>

      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontSize: 12.5, color: "var(--color-text-3)" }}>Ny adgangskode</span>
        <input
          type="password"
          autoComplete="new-password"
          required
          autoFocus
          value={kode}
          onChange={(e) => setKode(e.target.value)}
          style={authInputStyle}
        />
      </label>

      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontSize: 12.5, color: "var(--color-text-3)" }}>Gentag</span>
        <input
          type="password"
          autoComplete="new-password"
          required
          value={gentag}
          onChange={(e) => setGentag(e.target.value)}
          style={authInputStyle}
        />
      </label>

      {error ? (
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--color-danger)" }}>{error}</p>
      ) : null}

      <button
        type="submit"
        disabled={busy || harSession === null}
        style={{ ...authButtonStyle, opacity: busy || harSession === null ? 0.6 : 1 }}
      >
        {busy ? "Gemmer…" : "Gem og log ind"}
      </button>
    </form>
  );
}
