"use client";

import { useState } from "react";
import { useLeads } from "../leads-provider";
import { useAppState } from "../app-state";
import {
  ActionRow,
  ContactSection,
  HistorySection,
  NotesSection,
  DeleteSection,
  OfferSection,
  PhotosSection,
} from "../lead-sections";
import { DeleteLeadSheet, SmsSheet, StatusSheet, TemplateSheet } from "../sheets";
import { StatusDot } from "../ui";
import { nextStatus } from "@/lib/derive";
import { fullDateTime, joinParts, kr, taskSummary } from "@/lib/format";
import type { Lead } from "@/lib/types";

const BOTTOM_NAV_HEIGHT = 58;

/**
 * Lead-detaljen på mobil — fuldskærm, med en fast handlingsbar der ligger
 * oven på bundnavigationen uden sprække.
 *
 * Renderes med key={lead.id}, så redigerings- og ark-tilstand nulstilles ved
 * at komponenten remounter i stedet for via en effect.
 */
export function MobileLeadScreen({ lead }: { lead: Lead }) {
  const { updateLead, toast } = useLeads();
  const { closeLead, tab } = useAppState();

  // Tilbage-linket nævner fanen man kom fra, så det er tydeligt hvor man
  // lander — designet viser "‹ Alle".
  const backLabel = { overblik: "Overblik", opfoelgning: "Opfølgning", alle: "Alle" }[tab];

  const [editing, setEditing] = useState(false);
  const [sheet, setSheet] = useState<"sms" | "tpl" | "status" | "slet" | null>(null);

  const next = nextStatus(lead.status);

  const advance = async () => {
    if (!next) return;
    await updateLead(lead.id, { status: next });
    toast(`${lead.name.split(" ")[0]} → ${next}`);
  };

  return (
    <>
      <header style={{ background: "var(--color-navy)", padding: "18px 20px 20px" }}>
        <button
          type="button"
          onClick={closeLead}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            minHeight: 44,
            fontSize: 15,
            color: "var(--color-on-navy-2)",
          }}
        >
          ‹ {backLabel}
        </button>

        <h1
          style={{
            margin: "4px 0 0",
            fontFamily: "var(--font-display)",
            fontSize: 26,
            fontWeight: 700,
            lineHeight: 1.15,
            color: "#fff",
            textWrap: "pretty",
          }}
        >
          {lead.name}
        </h1>

        <p
          style={{
            margin: "6px 0 0",
            fontSize: 13.5,
            color: "var(--color-on-navy-2)",
          }}
        >
          {joinParts([
            taskSummary(lead.description, 34),
            lead.city,
            fullDateTime(lead.created_time),
          ])}
        </p>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginTop: 12,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              padding: "6px 13px",
              borderRadius: "var(--radius-pill)",
              background: "var(--color-navy-700)",
              border: "1px solid var(--color-navy-500)",
              fontSize: 13.5,
              fontWeight: 600,
              color: "#fff",
            }}
          >
            <StatusDot status={lead.status} />
            {lead.status}
          </span>

          <span
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 14,
              fontWeight: 700,
              color: "var(--color-yellow)",
            }}
          >
            {lead.value ? `Est. ${kr(lead.value)}` : "Estimat mangler"}
          </span>
        </div>
      </header>

      <ActionRow
        lead={lead}
        onSms={() => setSheet("sms")}
        onTemplate={() => setSheet("tpl")}
      />

      <main
        style={{
          flex: 1,
          padding: "20px 20px 210px",
          display: "flex",
          flexDirection: "column",
          gap: 22,
        }}
      >
        <ContactSection lead={lead} editing={editing} onToggleEdit={setEditing} />
        <PhotosSection lead={lead} />
        <OfferSection lead={lead} />
        <HistorySection lead={lead} />
        <NotesSection lead={lead} />
        <DeleteSection onRequestDelete={() => setSheet("slet")} />
      </main>

      {/* Handlingsbaren ligger oven på bundnavigationen, ikke over indholdet. */}
      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: BOTTOM_NAV_HEIGHT + 4,
          display: "flex",
          gap: 10,
          padding: "10px 20px",
          background: "var(--color-surface)",
          borderTop: "1px solid var(--color-line)",
          zIndex: 35,
        }}
      >
        <button
          type="button"
          onClick={() => setSheet("status")}
          style={{
            flex: 1,
            minHeight: 52,
            borderRadius: "var(--radius-btn)",
            background: "var(--color-yellow)",
            color: "var(--color-navy)",
            fontFamily: "var(--font-display)",
            fontSize: 16,
            fontWeight: 700,
          }}
        >
          Skift status
        </button>

        {next ? (
          <button
            type="button"
            onClick={() => void advance()}
            style={{
              minHeight: 52,
              padding: "0 16px",
              borderRadius: "var(--radius-btn)",
              background: "var(--color-chip)",
              color: "var(--color-text)",
              fontFamily: "var(--font-display)",
              fontSize: 14,
              fontWeight: 700,
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            → {next}
          </button>
        ) : null}
      </div>

      {sheet === "sms" ? (
        <SmsSheet lead={lead} onClose={() => setSheet(null)} />
      ) : null}
      {sheet === "tpl" ? (
        <TemplateSheet lead={lead} onClose={() => setSheet(null)} />
      ) : null}
      {sheet === "status" ? (
        <StatusSheet lead={lead} onClose={() => setSheet(null)} />
      ) : null}
      {sheet === "slet" ? (
        <DeleteLeadSheet
          lead={lead}
          onClose={() => setSheet(null)}
          onDeleted={closeLead}
        />
      ) : null}
    </>
  );
}
