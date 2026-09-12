"use client";

import { useMemo, useState } from "react";
import { useLeads } from "../leads-provider";
import { useAppState } from "../app-state";
import { MobileLeadCard } from "../lead-card";
import { MobileLeadScreen } from "./lead-screen";
import { StatusSheet, NewLeadSheet } from "../sheets";
import { Chip, EmptyNote, SectionLabel } from "../ui";
import {
  computeKpis,
  filterLeads,
  groupByFollowUp,
  groupByStatus,
  sumValue,
  zipLabel,
  zipOptions,
} from "@/lib/derive";
import { kr, weekdayDate } from "@/lib/format";
import { STATUS_COLORS, type Lead } from "@/lib/types";

/**
 * Mobil-layoutet: tre faner og en fast bundnavigation.
 *
 * Alt klikbart er mindst 44px højt. Det er ikke en anbefaling — appen bruges
 * med arbejdshandsker på.
 */

const BOTTOM_NAV_HEIGHT = 58;

export function MobileApp() {
  const { leads } = useLeads();
  const { tab, selectedLeadId } = useAppState();
  const [statusSheetLead, setStatusSheetLead] = useState<Lead | null>(null);
  const [newLeadOpen, setNewLeadOpen] = useState(false);

  const selectedLead = selectedLeadId
    ? leads.find((l) => l.id === selectedLeadId)
    : undefined;

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "var(--color-surface)",
        display: "flex",
        flexDirection: "column",
        // Toasten skal ligge over bundnavigation og handlingsbar.
        ["--toast-bottom" as string]: "86px",
      }}
    >
      {selectedLead ? (
        <MobileLeadScreen key={selectedLead.id} lead={selectedLead} />
      ) : (
        <>
          {tab === "overblik" ? <OverviewTab onNewLead={() => setNewLeadOpen(true)} /> : null}
          {tab === "opfoelgning" ? (
            <FollowUpTab onStatusTap={setStatusSheetLead} onNewLead={() => setNewLeadOpen(true)} />
          ) : null}
          {tab === "alle" ? (
            <AllTab onStatusTap={setStatusSheetLead} onNewLead={() => setNewLeadOpen(true)} />
          ) : null}
        </>
      )}

      <BottomNav />

      {statusSheetLead ? (
        <StatusSheet lead={statusSheetLead} onClose={() => setStatusSheetLead(null)} />
      ) : null}
      {newLeadOpen ? <NewLeadSheet onClose={() => setNewLeadOpen(false)} /> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------
   Header
------------------------------------------------------------------------- */

function Header({
  title,
  onNewLead,
  children,
}: {
  title: string;
  onNewLead: () => void;
  children?: React.ReactNode;
}) {
  const { now } = useLeads();

  return (
    <header style={{ background: "var(--color-navy)", padding: "26px 20px 18px" }}>
      {/* Firmanavnet ligger på sin egen linje. Designet er tegnet i 460px, hvor
          det er plads til navn og dato side om side; på en rigtig telefon
          (390px) mangler der et par pixels, og navnet knækkede grimt midt over
          "ApS". Egen linje holder på alle bredder. */}
      <p
        style={{
          margin: 0,
          fontFamily: "var(--font-display)",
          fontSize: 12.5,
          fontWeight: 800,
          letterSpacing: ".16em",
          textTransform: "uppercase",
          color: "var(--color-yellow)",
        }}
      >
        Holms Maler &amp; Tømrer ApS
      </p>

      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          marginTop: 6,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h1
            style={{
              margin: 0,
              fontFamily: "var(--font-display)",
              fontSize: 28,
              fontWeight: 700,
              lineHeight: 1.1,
              color: "#fff",
            }}
          >
            {title}
          </h1>
        </div>

        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--color-on-navy-2)" }}>
            {weekdayDate(now)}
          </p>
          <button
            type="button"
            onClick={onNewLead}
            style={{
              marginTop: 10,
              height: 42,
              padding: "0 16px",
              borderRadius: "var(--radius-input)",
              background: "var(--color-yellow)",
              color: "var(--color-navy)",
              fontFamily: "var(--font-display)",
              fontSize: 14,
              fontWeight: 700,
              whiteSpace: "nowrap",
            }}
          >
            + Nyt lead
          </button>
        </div>
      </div>

      {children}
    </header>
  );
}

/* -------------------------------------------------------------------------
   Fane 1 — Overblik
------------------------------------------------------------------------- */

function OverviewTab({ onNewLead }: { onNewLead: () => void }) {
  const { leads, now } = useLeads();
  const { showStatus } = useAppState();

  const kpis = useMemo(() => computeKpis(leads, now), [leads, now]);
  const groups = useMemo(() => groupByStatus(leads), [leads]);

  return (
    <>
      <Header title="Overblik" onNewLead={onNewLead}>
        <div
          style={{
            marginTop: 16,
            background: "var(--color-navy-700)",
            border: "1px solid var(--color-navy-500)",
            borderRadius: 12,
            padding: "15px 16px",
          }}
        >
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--color-on-navy-2)" }}>
            Åben pipeline
          </p>
          <p
            style={{
              margin: "2px 0 0",
              fontFamily: "var(--font-display)",
              fontSize: 32,
              fontWeight: 800,
              lineHeight: 1.1,
              color: "var(--color-yellow)",
            }}
          >
            {kr(kpis.openPipeline)}
          </p>

          <div
            style={{
              display: "flex",
              gap: 12,
              marginTop: 14,
              paddingTop: 13,
              borderTop: "1px solid var(--color-navy-500)",
            }}
          >
            <MiniStat value={String(kpis.unhandled)} label="nye leads" />
            <MiniStat value={kr(kpis.wonThisMonth)} label="vundet i md." />
            <MiniStat
              value={String(kpis.overdue + kpis.dueThisWeek)}
              label="skal følges op"
            />
          </div>
        </div>
      </Header>

      <main style={{ padding: `18px 20px ${BOTTOM_NAV_HEIGHT + 52}px`, flex: 1 }}>
        <SectionLabel>Status</SectionLabel>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
          {groups.map((group) => (
            <button
              key={group.status}
              type="button"
              onClick={() => showStatus(group.status)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                minHeight: 70,
                padding: "14px 16px",
                background: "var(--color-card)",
                border: "1px solid var(--color-line)",
                borderRadius: "var(--radius-card)",
                textAlign: "left",
              }}
            >
              {/* 4px lodret farvestribe i statusfarven */}
              <span
                aria-hidden
                style={{
                  width: 4,
                  alignSelf: "stretch",
                  borderRadius: 2,
                  background: STATUS_COLORS[group.status],
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 28,
                  fontWeight: 800,
                  lineHeight: 1,
                  minWidth: 38,
                }}
              >
                {group.leads.length}
              </span>
              <span style={{ minWidth: 0, flex: 1 }}>
                <span
                  style={{
                    display: "block",
                    fontFamily: "var(--font-display)",
                    fontSize: 16.5,
                    fontWeight: 700,
                  }}
                >
                  {group.status}
                </span>
                <span
                  style={{
                    display: "block",
                    fontSize: 12.5,
                    color: "var(--color-text-3)",
                  }}
                >
                  {group.leads.length === 0
                    ? "ingen lige nu"
                    : group.value > 0
                      ? `${kr(group.value)} i spil`
                      : `${group.leads.length} leads — tryk for at se`}
                </span>
              </span>
              <span
                aria-hidden
                style={{ fontSize: 20, color: "#9FB0BC", flexShrink: 0 }}
              >
                ›
              </span>
            </button>
          ))}
        </div>
      </main>
    </>
  );
}

function MiniStat({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <p
        style={{
          margin: 0,
          fontFamily: "var(--font-display)",
          fontSize: 19,
          fontWeight: 700,
          color: "#fff",
        }}
      >
        {value}
      </p>
      <p style={{ margin: 0, fontSize: 12, color: "var(--color-on-navy-2)" }}>
        {label}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------
   Fane 2 — Opfølgning
------------------------------------------------------------------------- */

function FollowUpTab({
  onStatusTap,
  onNewLead,
}: {
  onStatusTap: (lead: Lead) => void;
  onNewLead: () => void;
}) {
  const { leads, now } = useLeads();
  const groups = useMemo(() => groupByFollowUp(leads, now), [leads, now]);
  const total =
    groups.overskredet.length + groups.uge.length + groups.senere.length;

  return (
    <>
      <Header title="Opfølgning" onNewLead={onNewLead} />

      <main style={{ padding: `18px 20px ${BOTTOM_NAV_HEIGHT + 52}px`, flex: 1 }}>
        {total === 0 ? (
          <EmptyNote>Ingen opfølgninger sat. Godt arbejde.</EmptyNote>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            <FollowUpGroup
              label="Overskredet"
              color="var(--color-danger)"
              leads={groups.overskredet}
              onStatusTap={onStatusTap}
            />
            <FollowUpGroup
              label="Denne uge"
              color="var(--color-warn)"
              leads={groups.uge}
              onStatusTap={onStatusTap}
            />
            <FollowUpGroup
              label="Senere"
              color="var(--color-text-2)"
              leads={groups.senere}
              onStatusTap={onStatusTap}
            />
          </div>
        )}
      </main>
    </>
  );
}

function FollowUpGroup({
  label,
  color,
  leads,
  onStatusTap,
}: {
  label: string;
  color: string;
  leads: Lead[];
  onStatusTap: (lead: Lead) => void;
}) {
  // Tomme grupper vises ikke.
  if (leads.length === 0) return null;

  return (
    <section>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <SectionLabel color={color}>{label}</SectionLabel>
        <span style={{ fontSize: 12.5, color: "var(--color-text-3)" }}>
          {leads.length} stk.
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
        {leads.map((lead) => (
          <MobileLeadCard key={lead.id} lead={lead} onStatusTap={onStatusTap} />
        ))}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------
   Fane 3 — Alle
------------------------------------------------------------------------- */

function AllTab({
  onStatusTap,
  onNewLead,
}: {
  onStatusTap: (lead: Lead) => void;
  onNewLead: () => void;
}) {
  const { leads } = useLeads();
  const { filters, setQuery, toggleZip, setStatusFilter } = useAppState();

  const zips = useMemo(() => zipOptions(leads), [leads]);
  const visible = useMemo(() => filterLeads(leads, filters), [leads, filters]);
  const total = sumValue(visible);

  return (
    <>
      <Header title="Alle leads" onNewLead={onNewLead}>
        <input
          type="search"
          value={filters.query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Søg navn, opgave, by eller telefon"
          style={{
            marginTop: 16,
            width: "100%",
            height: 48,
            padding: "0 14px",
            borderRadius: 10,
            background: "var(--color-navy-700)",
            border: "1px solid var(--color-navy-500)",
            color: "#fff",
            fontSize: 16,
          }}
        />

        <div
          className="no-scrollbar"
          style={{
            display: "flex",
            gap: 8,
            marginTop: 12,
            overflowX: "auto",
            alignItems: "center",
          }}
        >
          <span
            style={{
              fontSize: 12,
              color: "var(--color-on-navy-2)",
              flexShrink: 0,
              paddingRight: 2,
            }}
          >
            Postnr.
          </span>

          {/* Et aktivt statusfilter ligger forrest med et kryds. */}
          {filters.status ? (
            <Chip selected onClick={() => setStatusFilter(null)}>
              {filters.status} ✕
            </Chip>
          ) : null}

          {zips.map((option) => (
            <Chip
              key={option.zip}
              onNavy
              selected={filters.zips.includes(option.zip)}
              onClick={() => toggleZip(option.zip)}
            >
              {zipLabel(option)}
            </Chip>
          ))}
        </div>
      </Header>

      <main style={{ padding: `16px 20px ${BOTTOM_NAV_HEIGHT + 52}px`, flex: 1 }}>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--color-text-3)" }}>
          {visible.length} {visible.length === 1 ? "lead" : "leads"}
          {total > 0 ? ` · ${kr(total)}` : ""}
        </p>

        {visible.length === 0 ? (
          <EmptyNote>Ingen leads matcher. Prøv at rydde filtrene.</EmptyNote>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {visible.map((lead) => (
              <MobileLeadCard key={lead.id} lead={lead} onStatusTap={onStatusTap} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}

/* -------------------------------------------------------------------------
   Bundnavigation — global, også synlig på lead-detaljen
------------------------------------------------------------------------- */

function BottomNav() {
  const { leads, now } = useLeads();
  const { tab, setTab, selectedLeadId } = useAppState();

  const kpis = useMemo(() => computeKpis(leads, now), [leads, now]);

  const items = [
    { key: "overblik" as const, label: "Overblik", sub: `${leads.length} i alt` },
    {
      key: "opfoelgning" as const,
      label: "Opfølgning",
      sub: `${kpis.overdue + kpis.dueThisWeek} denne uge`,
    },
    { key: "alle" as const, label: "Alle", sub: "søg & filtrér" },
  ];

  return (
    <nav
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        height: BOTTOM_NAV_HEIGHT,
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        background: "var(--color-card)",
        boxShadow: "var(--shadow-bottomnav)",
        zIndex: 40,
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {items.map((item) => {
        // Er et lead åbent, er ingen fane markeret som aktiv — et tryk
        // lukker leadet og går til fanen.
        const active = !selectedLeadId && tab === item.key;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 1,
              borderTop: `3px solid ${active ? "var(--color-yellow)" : "transparent"}`,
              color: active ? "var(--color-navy)" : "var(--color-text-3)",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              {item.label}
            </span>
            <span style={{ fontSize: 11, color: "var(--color-text-4)" }}>
              {item.sub}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
