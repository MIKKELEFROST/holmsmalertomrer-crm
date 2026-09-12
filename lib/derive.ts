/**
 * Afledte tal og filtrering.
 *
 * Rene funktioner uden React, så mobil- og desktop-layoutet regner præcis det
 * samme ud og ikke kan komme til at vise hver sit tal.
 */

import { followUpBucket, daysUntil, toParts } from "./format";
import { OPEN_STATUSES, STATUSES, type Lead, type LeadStatus } from "./types";

export interface Filters {
  query: string;
  zips: string[];
  status: LeadStatus | null;
}

export const EMPTY_FILTERS: Filters = { query: "", zips: [], status: null };

/** Søgning rammer navn, opgave, by og telefon — det Meick kan huske i bilen. */
function matchesQuery(lead: Lead, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const haystack = [
    lead.name,
    lead.description,
    lead.city,
    lead.zip,
    lead.address,
    // Telefonnummer uden mellemrum, så "23 71 09 24" også rammer.
    lead.phone?.replace(/\s+/g, ""),
    lead.email,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const normalisedQuery = q.replace(/\s+/g, "");
  return haystack.includes(q) || haystack.replace(/\s+/g, "").includes(normalisedQuery);
}

export function filterLeads(leads: Lead[], filters: Filters): Lead[] {
  return leads.filter((lead) => {
    if (filters.status && lead.status !== filters.status) return false;
    if (filters.zips.length > 0 && (!lead.zip || !filters.zips.includes(lead.zip)))
      return false;
    return matchesQuery(lead, filters.query);
  });
}

/** Postnumre der findes i dataen, sorteret numerisk, med antal og bynavn. */
export interface ZipOption {
  zip: string;
  city: string | null;
  count: number;
}

export function zipOptions(leads: Lead[]): ZipOption[] {
  const map = new Map<string, ZipOption>();

  for (const lead of leads) {
    if (!lead.zip) continue;
    const existing = map.get(lead.zip);
    if (existing) existing.count++;
    else map.set(lead.zip, { zip: lead.zip, city: lead.city, count: 1 });
  }

  return [...map.values()].sort((a, b) => a.zip.localeCompare(b.zip));
}

/** Chip-teksten: "2600 Glostrup (2)" når der er flere end ét lead. */
export function zipLabel(option: ZipOption): string {
  const base = option.city ? `${option.zip} ${option.city}` : option.zip;
  return option.count > 1 ? `${base} (${option.count})` : base;
}

/* -------------------------------------------------------------------------
   Tal til KPI'er
------------------------------------------------------------------------- */

export interface Kpis {
  /** Antal leads i status Nye. */
  unhandled: number;
  total: number;
  /** Sum af estimater på alle åbne statusser. */
  openPipeline: number;
  /** Sum af tilbudspris — eller estimat — på afsluttede sager i denne måned. */
  wonThisMonth: number;
  wonCount: number;
  /** Leads med en opfølgningsdato der er passeret. */
  overdue: number;
  /** Leads med opfølgning i dag eller inden for ugen. */
  dueThisWeek: number;
}

export function computeKpis(leads: Lead[], now: Date): Kpis {
  const nowParts = toParts(now);

  let unhandled = 0;
  let openPipeline = 0;
  let wonThisMonth = 0;
  let wonCount = 0;
  let overdue = 0;
  let dueThisWeek = 0;

  for (const lead of leads) {
    if (lead.status === "Nye") unhandled++;

    if (OPEN_STATUSES.includes(lead.status)) {
      openPipeline += lead.value ?? 0;
    }

    if (lead.status === "Afsluttet") {
      const parts = toParts(lead.updated_at);
      if (parts.year === nowParts.year && parts.month === nowParts.month) {
        // Tilbudsprisen er det faktiske beløb; estimatet er reserven.
        wonThisMonth += lead.price ?? lead.value ?? 0;
        wonCount++;
      }
    }

    if (lead.follow_up) {
      const diff = daysUntil(lead.follow_up, now);
      if (diff < 0) overdue++;
      else if (diff <= 7) dueThisWeek++;
    }
  }

  return {
    unhandled,
    total: leads.length,
    openPipeline,
    wonThisMonth,
    wonCount,
    overdue,
    dueThisWeek,
  };
}

/* -------------------------------------------------------------------------
   Gruppering
------------------------------------------------------------------------- */

export interface StatusGroup {
  status: LeadStatus;
  leads: Lead[];
  /** Sum af estimater i gruppen. */
  value: number;
}

/** Alle syv statusser, også de tomme — rækkefølgen er fast. */
export function groupByStatus(leads: Lead[]): StatusGroup[] {
  return STATUSES.map((status) => {
    const inStatus = leads.filter((lead) => lead.status === status);
    return {
      status,
      leads: inStatus,
      value: inStatus.reduce((sum, lead) => sum + (lead.value ?? 0), 0),
    };
  });
}

export interface FollowUpGroups {
  overskredet: Lead[];
  uge: Lead[];
  senere: Lead[];
}

/** Leads med opfølgningsdato, delt i tre og sorteret efter dato. */
export function groupByFollowUp(leads: Lead[], now: Date): FollowUpGroups {
  const groups: FollowUpGroups = { overskredet: [], uge: [], senere: [] };

  for (const lead of leads) {
    if (!lead.follow_up) continue;
    groups[followUpBucket(lead.follow_up, now)].push(lead);
  }

  const byDate = (a: Lead, b: Lead) =>
    (a.follow_up ?? "").localeCompare(b.follow_up ?? "");

  groups.overskredet.sort(byDate);
  groups.uge.sort(byDate);
  groups.senere.sort(byDate);

  return groups;
}

/** Summen af estimater — bruges i resultatlinjen "19 leads · 340.000 kr." */
export function sumValue(leads: Lead[]): number {
  return leads.reduce((sum, lead) => sum + (lead.value ?? 0), 0);
}

/** Næste status i rækken, eller null hvis leadet står sidst. */
export function nextStatus(status: LeadStatus): LeadStatus | null {
  const index = STATUSES.indexOf(status);
  return index >= 0 && index < STATUSES.length - 1 ? STATUSES[index + 1] : null;
}

/** Forrige status i rækken, eller null hvis leadet står først. */
export function previousStatus(status: LeadStatus): LeadStatus | null {
  const index = STATUSES.indexOf(status);
  return index > 0 ? STATUSES[index - 1] : null;
}
