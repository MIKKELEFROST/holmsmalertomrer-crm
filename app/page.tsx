import { Suspense } from "react";
import { getCurrentUserName, getLeads } from "@/lib/leads";
import { AppShell } from "@/components/app-shell";

/**
 * Appen er én side. Navigation og filtre ligger i URL'ens søgeparametre,
 * så et lead kan sendes videre som link og tilbage-knappen virker som
 * forventet.
 */
export default async function Page() {
  const [leads, currentUser] = await Promise.all([
    getLeads(),
    getCurrentUserName(),
  ]);

  return (
    <Suspense fallback={<Loading />}>
      <AppShell
        leads={leads}
        currentUser={currentUser}
        // Serverens tidspunkt sendes med, så relativ tid ("2 t. siden")
        // giver samme streng på server og klient ved første render.
        serverNow={new Date().toISOString()}
      />
    </Suspense>
  );
}

function Loading() {
  return (
    <p
      style={{
        padding: 40,
        fontSize: 14.5,
        color: "var(--color-text-3)",
        textAlign: "center",
      }}
    >
      Indlæser leads…
    </p>
  );
}
