"use client";

import { LeadsProvider } from "./leads-provider";
import { AppStateProvider, useAppState } from "./app-state";
import { ToastHost } from "./toast-host";
import { MobileApp } from "./mobile/mobile-app";
import { DesktopApp } from "./desktop/desktop-app";
import type { Lead } from "@/lib/types";

/**
 * Begge layouts renderes, og CSS vælger hvilket der vises.
 *
 * Alternativet — at måle vinduet og kun rendere det ene — giver enten et
 * forkert layout i første render på serveren eller et synligt hop efter
 * hydrering. Med CSS er der ingen af delene, og prisen er en smule ekstra
 * DOM som skjules med display:none.
 */
export function AppShell({
  leads,
  currentUser,
  serverNow,
}: {
  leads: Lead[];
  currentUser: string;
  serverNow: string;
}) {
  return (
    <LeadsProvider
      initialLeads={leads}
      serverNow={serverNow}
      currentUser={currentUser}
    >
      <AppStateProvider>
        <Layouts />
        <ToastHost />
      </AppStateProvider>
    </LeadsProvider>
  );
}

function Layouts() {
  const { forcedLayout } = useAppState();

  return (
    <div data-force-layout={forcedLayout ?? undefined}>
      <div className="mobile-only">
        <MobileApp />
      </div>
      <div className="desktop-only">
        <DesktopApp />
      </div>
    </div>
  );
}
