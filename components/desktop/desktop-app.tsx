"use client";

import { useMemo, useState } from "react";
import { useLeads } from "../leads-provider";
import { useAppState, type DesktopView } from "../app-state";
import { ConversationList } from "../conversations";
import { awaitingReplyCount } from "@/lib/derive";
import { Kanban } from "./kanban";
import { LeadTable } from "./lead-table";
import { LeadPanel } from "./lead-panel";
import { NewLeadSheet } from "../sheets";
import { Chip } from "../ui";
import {
  computeKpis,
  filterLeads,
  groupByFollowUp,
  sumValue,
  zipLabel,
  zipOptions,
} from "@/lib/derive";
import { kr } from "@/lib/format";

/**
 * Desktop-layoutet: sidebar, KPI-række, filtre og enten kanban eller tabel.
 * Et åbent lead glider ind som sidepanel fra højre.
 */
export function DesktopApp() {
  const { leads, now, currentUser } = useLeads();
  const { view, filters, selectedLeadId, setQuery, toggleZip, setStatusFilter } =
    useAppState();
  const [newLeadOpen, setNewLeadOpen] = useState(false);

  const kpis = useMemo(() => computeKpis(leads, now), [leads, now]);
  const zips = useMemo(() => zipOptions(leads), [leads]);
  const visible = useMemo(() => filterLeads(leads, filters), [leads, filters]);

  // Opfølgningsvisningen er den samme tabel, filtreret og sorteret på dato.
  const followUps = useMemo(() => {
    const groups = groupByFollowUp(visible, now);
    return [...groups.overskredet, ...groups.uge, ...groups.senere];
  }, [visible, now]);

  const selectedLead = selectedLeadId
    ? leads.find((l) => l.id === selectedLeadId)
    : undefined;

  const titles: Record<DesktopView, string> = {
    pipeline: "Pipeline",
    liste: "Alle leads",
    opfoelgning: "Opfølgning",
    beskeder: "Beskeder",
  };

  return (
    <div
      style={{
        display: "flex",
        height: "100dvh",
        overflow: "hidden",
        background: "var(--color-page)",
        ["--toast-bottom" as string]: "24px",
      }}
    >
      <Sidebar kpis={kpis} totalLeads={leads.length} currentUser={currentUser} />

      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Topbar */}
        <div
          style={{
            background: "var(--color-surface)",
            borderBottom: "1px solid var(--color-line)",
            padding: "18px 22px 16px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 20,
              flexWrap: "wrap",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <h1
                style={{
                  margin: 0,
                  fontFamily: "var(--font-display)",
                  fontSize: 24,
                  fontWeight: 700,
                  lineHeight: 1.15,
                }}
              >
                {titles[view]}
              </h1>
              <p
                style={{
                  margin: "3px 0 0",
                  fontSize: 13.5,
                  color: "var(--color-text-3)",
                }}
              >
                {visible.length} {visible.length === 1 ? "lead" : "leads"} ·{" "}
                {kr(sumValue(visible))} åben værdi
              </p>
            </div>

            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <input
                type="search"
                value={filters.query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Søg navn, opgave eller by"
                style={{
                  width: 250,
                  height: 44,
                  padding: "0 14px",
                  borderRadius: "var(--radius-input)",
                  background: "var(--color-card)",
                  border: "1px solid var(--color-line-input)",
                  fontSize: 15,
                }}
              />
              <button
                type="button"
                onClick={() => setNewLeadOpen(true)}
                style={{
                  height: 44,
                  padding: "0 18px",
                  borderRadius: "var(--radius-input)",
                  background: "var(--color-yellow)",
                  color: "var(--color-navy)",
                  fontFamily: "var(--font-display)",
                  fontSize: 15,
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                }}
              >
                + Nyt lead
              </button>
            </div>
          </div>

          {/* KPI-kort */}
          <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
            <KpiCard
              label="Ubehandlede leads"
              value={String(kpis.unhandled)}
              sub={`af ${kpis.total} i alt`}
              color="var(--color-warn)"
            />
            <KpiCard
              label="Åben pipeline"
              value={kr(kpis.openPipeline)}
              sub={
                kpis.openPipeline === 0
                  ? "sæt estimat på et lead"
                  : "på tværs af åbne sager"
              }
              color="var(--color-navy)"
            />
            <KpiCard
              label="Vundet"
              value={kr(kpis.wonThisMonth)}
              sub={`${kpis.wonCount} afsluttede sager`}
              color="var(--color-success)"
            />
            <KpiCard
              label="Overskredet opfølgning"
              value={String(kpis.overdue)}
              sub={kpis.overdue > 0 ? "kræver handling" : "alt er fanget op"}
              color={kpis.overdue > 0 ? "var(--color-danger)" : "var(--color-success)"}
            />
          </div>

          {/* Postnummer-filtre. Én linje med vandret scroll — ombryder de,
              skubber de boardet ned. */}
          <div
            className="no-scrollbar"
            style={{
              display: "flex",
              flexWrap: "nowrap",
              overflowX: "auto",
              gap: 8,
              marginTop: 14,
              alignItems: "center",
            }}
          >
            <span
              style={{
                fontSize: 12.5,
                color: "var(--color-text-3)",
                flexShrink: 0,
                paddingRight: 2,
              }}
            >
              Postnummer:
            </span>

            {filters.status ? (
              <Chip selected onClick={() => setStatusFilter(null)}>
                {filters.status} ✕
              </Chip>
            ) : null}

            {zips.map((option) => (
              <Chip
                key={option.zip}
                selected={filters.zips.includes(option.zip)}
                onClick={() => toggleZip(option.zip)}
                style={{
                  background: filters.zips.includes(option.zip)
                    ? "var(--color-yellow)"
                    : "var(--color-card)",
                  border: `1px solid ${
                    filters.zips.includes(option.zip)
                      ? "var(--color-yellow)"
                      : "var(--color-line-input)"
                  }`,
                }}
              >
                {zipLabel(option)}
              </Chip>
            ))}
          </div>
        </div>

        {view === "beskeder" ? (
          // Samtaler er ikke leads: hverken søgefelt, postnummer-chips eller
          // statusfilter giver mening her, og tabellen kan ikke vise dem.
          <div style={{ flex: 1, overflow: "auto", padding: "20px 22px 28px" }}>
            <ConversationList />
          </div>
        ) : view === "pipeline" ? (
          <Kanban leads={visible} />
        ) : (
          <div style={{ flex: 1, overflow: "auto", padding: "20px 22px 28px" }}>
            <LeadTable
              leads={view === "opfoelgning" ? followUps : visible}
              emptyText={
                view === "opfoelgning"
                  ? "Ingen opfølgninger sat. Godt arbejde."
                  : "Ingen leads matcher. Prøv at rydde filtrene."
              }
            />
          </div>
        )}
      </div>

      {selectedLead ? <LeadPanel key={selectedLead.id} lead={selectedLead} /> : null}
      {newLeadOpen ? <NewLeadSheet onClose={() => setNewLeadOpen(false)} /> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------
   Sidebar
------------------------------------------------------------------------- */

function Sidebar({
  kpis,
  totalLeads,
  currentUser,
}: {
  kpis: ReturnType<typeof computeKpis>;
  totalLeads: number;
  currentUser: string;
}) {
  const { view, setView } = useAppState();
  const { leads } = useLeads();

  const items: { key: DesktopView; label: string; count: number }[] = [
    { key: "pipeline", label: "Pipeline", count: totalLeads },
    { key: "liste", label: "Alle leads", count: totalLeads },
    {
      key: "opfoelgning",
      label: "Opfølgning",
      count: kpis.overdue + kpis.dueThisWeek,
    },
    {
      key: "beskeder",
      label: "Beskeder",
      // Tallet er dem der venter på svar, ikke antallet af samtaler.
      // Et tal man kan gøre noget ved, frem for et tal der bare vokser.
      count: awaitingReplyCount(leads),
    },
  ];

  return (
    <aside
      style={{
        width: 190,
        flexShrink: 0,
        background: "var(--color-navy)",
        display: "flex",
        flexDirection: "column",
        padding: "22px 14px 18px",
      }}
    >
      <p
        style={{
          margin: "0 8px",
          fontFamily: "var(--font-display)",
          fontSize: 11.5,
          fontWeight: 800,
          letterSpacing: ".16em",
          lineHeight: 1.5,
          textTransform: "uppercase",
          color: "var(--color-yellow)",
        }}
      >
        Holms Maler
        <br />&amp; Tømrer ApS
      </p>

      <nav
        style={{
          marginTop: 26,
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        {items.map((item) => {
          const active = view === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setView(item.key)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                minHeight: 44,
                padding: "0 12px",
                borderRadius: "var(--radius-input)",
                background: active ? "var(--color-navy-700)" : "transparent",
                color: active ? "var(--color-yellow)" : "var(--color-on-navy-3)",
                fontFamily: "var(--font-display)",
                fontSize: 15,
                fontWeight: 700,
                textAlign: "left",
              }}
            >
              {item.label}
              <span style={{ fontSize: 13, opacity: 0.85 }}>{item.count}</span>
            </button>
          );
        })}
      </nav>

      <div
        style={{
          marginTop: "auto",
          paddingTop: 18,
          borderTop: "1px solid var(--color-navy-500)",
        }}
      >
        <p
          style={{
            margin: "0 8px",
            fontFamily: "var(--font-display)",
            fontSize: 14,
            fontWeight: 700,
            color: "#fff",
          }}
        >
          {currentUser}
        </p>
        <p style={{ margin: "0 8px", fontSize: 12, color: "var(--color-on-navy-2)" }}>
          Indehaver
        </p>
        <form action="/auth/logout" method="post" style={{ margin: "12px 8px 0" }}>
          <button
            type="submit"
            style={{
              fontSize: 12.5,
              color: "var(--color-on-navy-2)",
              minHeight: 32,
            }}
          >
            Log ud
          </button>
        </form>
      </div>
    </aside>
  );
}

/* -------------------------------------------------------------------------
   KPI-kort
------------------------------------------------------------------------- */

function KpiCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub: string;
  color: string;
}) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 150,
        background: "var(--color-card)",
        border: "1px solid var(--color-line)",
        borderRadius: 11,
        padding: "13px 15px",
      }}
    >
      <p style={{ margin: 0, fontSize: 12.5, color: "var(--color-text-3)" }}>
        {label}
      </p>
      <p
        style={{
          margin: "4px 0 0",
          fontFamily: "var(--font-display)",
          fontSize: 23,
          fontWeight: 800,
          lineHeight: 1.2,
          color,
        }}
      >
        {value}
      </p>
      <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--color-text-4)" }}>
        {sub}
      </p>
    </div>
  );
}
