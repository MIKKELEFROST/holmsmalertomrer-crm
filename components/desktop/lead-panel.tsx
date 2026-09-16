"use client";

import { useEffect, useState } from "react";
import { useLeads } from "../leads-provider";
import { useAppState } from "../app-state";
import {
  ActionRow,
  ContactSection,
  CorrespondenceSection,
  HistorySection,
  NotesSection,
  DeleteSection,
  OfferSection,
  PhotosSection,
} from "../lead-sections";
import { DeleteLeadSheet, MailSheet, SmsSheet, TemplateSheet } from "../sheets";
import { StatusDot } from "../ui";
import { fullDateTime, joinParts, kr, taskSummary } from "@/lib/format";
import { STATUSES, type Lead, type LeadStatus } from "@/lib/types";

/**
 * Lead-sidepanelet på desktop.
 *
 * Alle syv statusser ligger som chips i hovedet frem for i en dropdown —
 * hurtigere når man sidder ved skrivebordet og skal flytte flere leads.
 *
 * Renderes med key={lead.id}, så tilstanden nulstilles ved remount når et
 * andet lead åbnes.
 */
export function LeadPanel({ lead }: { lead: Lead }) {
  const { updateLead, toast } = useLeads();
  const { closeLead } = useAppState();

  const [editing, setEditing] = useState(false);
  const [sheet, setSheet] = useState<"sms" | "mail" | "tpl" | "slet" | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !sheet) closeLead();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [closeLead, sheet]);

  const setStatus = async (status: LeadStatus) => {
    if (status === lead.status) return;
    await updateLead(lead.id, { status });
    toast(`${lead.name.split(" ")[0]} → ${status}`);
  };

  return (
    <>
      <div
        onClick={closeLead}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(7,34,54,.45)",
          zIndex: 50,
          animation: "fade-in .15s ease",
        }}
      />

      <aside
        role="dialog"
        aria-label={`Lead: ${lead.name}`}
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "min(470px, 100%)",
          zIndex: 55,
          background: "var(--color-surface)",
          boxShadow: "var(--shadow-panel)",
          overflowY: "auto",
          // Panelet må aldrig få vandret scroll.
          overflowX: "hidden",
          animation: "panel-in .22s cubic-bezier(.22,.61,.36,1)",
        }}
      >
        <header style={{ background: "var(--color-navy)", padding: "20px 22px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 14,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <h2
                style={{
                  margin: 0,
                  fontFamily: "var(--font-display)",
                  fontSize: 23,
                  fontWeight: 700,
                  lineHeight: 1.2,
                  color: "#fff",
                  textWrap: "pretty",
                }}
              >
                {lead.name}
              </h2>
              <p
                style={{
                  margin: "5px 0 0",
                  fontSize: 13,
                  color: "var(--color-on-navy-2)",
                }}
              >
                {joinParts([
                  taskSummary(lead.description, 30),
                  lead.city,
                  fullDateTime(lead.created_time),
                ])}
              </p>
            </div>

            <button
              type="button"
              onClick={closeLead}
              aria-label="Luk"
              style={{
                width: 36,
                height: 36,
                flexShrink: 0,
                borderRadius: "var(--radius-input)",
                background: "var(--color-navy-700)",
                color: "#fff",
                fontSize: 18,
                display: "grid",
                placeItems: "center",
              }}
            >
              ×
            </button>
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
              marginTop: 14,
            }}
          >
            {STATUSES.map((status) => {
              const active = status === lead.status;
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => void setStatus(status)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "6px 11px",
                    borderRadius: "var(--radius-pill)",
                    background: active ? "var(--color-yellow)" : "var(--color-navy-700)",
                    border: `1px solid ${active ? "var(--color-yellow)" : "var(--color-navy-500)"}`,
                    color: active ? "var(--color-navy)" : "var(--color-on-navy-3)",
                    fontSize: 12.5,
                    fontWeight: active ? 700 : 500,
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}
                >
                  <StatusDot status={status} size={7} />
                  {status}
                </button>
              );
            })}
          </div>

          <p
            style={{
              margin: "12px 0 0",
              fontFamily: "var(--font-display)",
              fontSize: 14,
              fontWeight: 700,
              color: "var(--color-yellow)",
            }}
          >
            {lead.value ? `Est. ${kr(lead.value)}` : "Estimat mangler"}
          </p>
        </header>

        <ActionRow
          lead={lead}
          onSms={() => setSheet("sms")}
          onMail={() => setSheet("mail")}
          onTemplate={() => setSheet("tpl")}
        />

        <div
          style={{
            padding: "20px 22px 40px",
            display: "flex",
            flexDirection: "column",
            gap: 20,
          }}
        >
          <ContactSection
            lead={lead}
            editing={editing}
            onToggleEdit={setEditing}
            desktop
          />
          <PhotosSection lead={lead} columns={3} aspect="4 / 3" />
          <OfferSection lead={lead} />
          <CorrespondenceSection lead={lead} />
          <HistorySection lead={lead} />
          <NotesSection lead={lead} />
          <DeleteSection onRequestDelete={() => setSheet("slet")} />
        </div>
      </aside>

      {sheet === "sms" ? (
        <SmsSheet lead={lead} onClose={() => setSheet(null)} />
      ) : null}
      {sheet === "mail" ? (
        <MailSheet lead={lead} onClose={() => setSheet(null)} />
      ) : null}
      {sheet === "tpl" ? (
        <TemplateSheet lead={lead} onClose={() => setSheet(null)} />
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
