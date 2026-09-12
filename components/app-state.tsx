"use client";

import { createContext, useCallback, useContext, useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { Filters } from "@/lib/derive";
import { STATUSES, type LeadStatus } from "@/lib/types";

export type MobileTab = "overblik" | "opfoelgning" | "alle";
export type DesktopView = "pipeline" | "liste" | "opfoelgning";

/**
 * Navigation og filtre bor i URL'en, ikke i komponent-state.
 *
 * Det betyder at et lead kan sendes videre som link, at tilbage-knappen
 * lukker leadet i stedet for at forlade appen, og at en filtreret liste kan
 * genbesøges.
 *
 * URL'en opdateres med det native history API, ikke med router.push, så et
 * klik ikke koster en tur til serveren — se navigate() nedenfor. `replace`
 * bruges til filtre (de skal ikke fylde i historikken) og `push` til det der
 * føles som et sted man kan gå tilbage fra.
 */
interface AppStateValue {
  tab: MobileTab;
  view: DesktopView;
  selectedLeadId: string | null;
  filters: Filters;
  /** Tvunget layout til demo og test: ?layout=mobil|desktop */
  forcedLayout: "mobil" | "desktop" | null;

  setTab: (tab: MobileTab) => void;
  setView: (view: DesktopView) => void;
  openLead: (leadId: string) => void;
  closeLead: () => void;
  setQuery: (query: string) => void;
  toggleZip: (zip: string) => void;
  setStatusFilter: (status: LeadStatus | null) => void;
  /** Åbner Alle-fanen filtreret på én status — statusrækkerne på Overblik. */
  showStatus: (status: LeadStatus) => void;
  clearFilters: () => void;
}

const AppStateContext = createContext<AppStateValue | null>(null);

export function useAppState() {
  const context = useContext(AppStateContext);
  if (!context) throw new Error("useAppState skal bruges inde i AppStateProvider");
  return context;
}

const isTab = (value: string | null): value is MobileTab =>
  value === "overblik" || value === "opfoelgning" || value === "alle";

const isView = (value: string | null): value is DesktopView =>
  value === "pipeline" || value === "liste" || value === "opfoelgning";

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tabParam = searchParams.get("tab");
  const viewParam = searchParams.get("view");
  const statusParam = searchParams.get("status");
  const zipParam = searchParams.get("zip");
  const layoutParam = searchParams.get("layout");

  const tab: MobileTab = isTab(tabParam) ? tabParam : "overblik";
  const view: DesktopView = isView(viewParam) ? viewParam : "pipeline";
  const selectedLeadId = searchParams.get("lead");

  const filters = useMemo<Filters>(
    () => ({
      query: searchParams.get("q") ?? "",
      zips: zipParam ? zipParam.split(",").filter(Boolean) : [],
      status: STATUSES.includes(statusParam as LeadStatus)
        ? (statusParam as LeadStatus)
        : null,
    }),
    [searchParams, zipParam, statusParam],
  );

  const forcedLayout =
    layoutParam === "mobil" || layoutParam === "desktop" ? layoutParam : null;

  /** Skriver et sæt ændringer til URL'en. `null` fjerner parameteren. */
  const navigate = useCallback(
    (changes: Record<string, string | null>, mode: "push" | "replace") => {
      const params = new URLSearchParams(searchParams.toString());

      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === "") params.delete(key);
        else params.set(key, value);
      }

      const queryString = params.toString();
      const url = queryString ? `${pathname}?${queryString}` : pathname;

      // Native history API frem for router.push.
      //
      // Siden er en server component, så router.push ville hente den forfra
      // for hvert klik — et rundtur til Irland plus fire databasekald, bare
      // for at skifte fane eller trykke på et postnummer. Målt på det live
      // site: 300–1100 ms pr. klik, og det er fra et datacenter. Ude i bilen
      // på mobildata er det meget værre.
      //
      // Alle leads ligger allerede i browseren, og filtrering sker lokalt.
      // Der er derfor intet serveren skal bidrage med her. pushState og
      // replaceState er integreret i Next.js' router og synkroniserer med
      // useSearchParams, så URL'en, tilbage-knappen og delbare links virker
      // præcis som før — bare uden ventetiden.
      window.history[mode === "push" ? "pushState" : "replaceState"](null, "", url);
    },
    [pathname, searchParams],
  );

  const value = useMemo<AppStateValue>(
    () => ({
      tab,
      view,
      selectedLeadId,
      filters,
      forcedLayout,

      setTab: (next) =>
        // Et fanetryk lukker også et åbent lead — bundnavigationen er global.
        navigate({ tab: next === "overblik" ? null : next, lead: null }, "push"),

      setView: (next) =>
        navigate({ view: next === "pipeline" ? null : next }, "push"),

      openLead: (leadId) => navigate({ lead: leadId }, "push"),

      closeLead: () => navigate({ lead: null }, "push"),

      setQuery: (query) => navigate({ q: query || null }, "replace"),

      toggleZip: (zip) => {
        const next = filters.zips.includes(zip)
          ? filters.zips.filter((z) => z !== zip)
          : [...filters.zips, zip];
        navigate({ zip: next.length ? next.join(",") : null }, "replace");
      },

      setStatusFilter: (status) => navigate({ status }, "replace"),

      showStatus: (status) => navigate({ tab: "alle", status, lead: null }, "push"),

      clearFilters: () =>
        navigate({ q: null, zip: null, status: null }, "replace"),
    }),
    [tab, view, selectedLeadId, filters, forcedLayout, navigate],
  );

  return <AppStateContext value={value}>{children}</AppStateContext>;
}
