import { Suspense } from "react";
import { getCurrentUserName, getLeads } from "@/lib/leads";
import { AppShell } from "@/components/app-shell";

/**
 * Appen er én side. Navigation og filtre ligger i URL'ens søgeparametre,
 * så et lead kan sendes videre som link og tilbage-knappen virker som
 * forventet.
 *
 * Selve sidefunktionen er med vilje ikke async. Ventede den på databasen,
 * ville serveren ikke sende ét eneste byte før alle leads var hentet — heller
 * ikke <head>, hvor der står hvilken CSS, hvilke fonte og hvilket JavaScript
 * browseren skal bruge. Nu strømmer skallen ud med det samme, browseren
 * begynder at hente det statiske mens databasen svarer, og leads'ene kommer
 * bagefter i samme svar.
 */
export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Leads />
    </Suspense>
  );
}

async function Leads() {
  const [leads, currentUser] = await Promise.all([
    getLeads(),
    getCurrentUserName(),
  ]);

  return (
    <AppShell
      leads={leads}
      currentUser={currentUser}
      // Serverens tidspunkt sendes med, så relativ tid ("2 t. siden")
      // giver samme streng på server og klient ved første render.
      serverNow={new Date().toISOString()}
    />
  );
}

function Loading() {
  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "var(--color-page)",
        display: "grid",
        placeItems: "center",
        padding: 40,
      }}
    >
      <p style={{ margin: 0, fontSize: 14.5, color: "var(--color-text-3)" }}>
        Indlæser leads…
      </p>
    </div>
  );
}
