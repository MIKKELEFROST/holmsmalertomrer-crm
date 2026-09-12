/**
 * Rammen om login, glemt adgangskode og ny adgangskode.
 *
 * De tre skærme skal ligne hinanden — man går fra den ene til den anden midt
 * i et forløb hvor man i forvejen er irriteret over ikke at kunne komme ind.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
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
          maxWidth: 380,
          background: "var(--color-surface)",
          borderRadius: 16,
          padding: 28,
        }}
      >
        {children}
      </div>
    </main>
  );
}

/** Brandnavn og overskrift, ens på tværs af de tre skærme. */
export function AuthHeading({ title }: { title: string }) {
  return (
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
        {title}
      </h1>
    </div>
  );
}

/** Inputfelt. 16px, så iOS ikke zoomer ind når feltet får fokus. */
export const authInputStyle: React.CSSProperties = {
  background: "var(--color-card)",
  border: "1px solid var(--color-line-input)",
  borderRadius: "var(--radius-input)",
  padding: "12px 13px",
  fontSize: 16,
  minHeight: 48,
  width: "100%",
};

export const authButtonStyle: React.CSSProperties = {
  minHeight: 52,
  width: "100%",
  borderRadius: "var(--radius-btn)",
  background: "var(--color-yellow)",
  color: "var(--color-navy)",
  fontFamily: "var(--font-display)",
  fontSize: 16,
  fontWeight: 700,
};
