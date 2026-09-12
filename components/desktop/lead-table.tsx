"use client";

import { useLeads } from "../leads-provider";
import { useAppState } from "../app-state";
import { EmptyNote, StatusDot } from "../ui";
import { followUpBucket, followUpLabel, kr, taskSummary } from "@/lib/format";
import type { Lead } from "@/lib/types";

const COLUMNS = "1.4fr 1.3fr .9fr .9fr .8fr";

const BUCKET_COLORS = {
  overskredet: "var(--color-danger)",
  uge: "var(--color-warn)",
  senere: "var(--color-text-2)",
} as const;

/** Listevisningen. Klik på en række åbner sidepanelet. */
export function LeadTable({
  leads,
  emptyText,
}: {
  leads: Lead[];
  emptyText: string;
}) {
  const { now } = useLeads();
  const { openLead } = useAppState();

  if (leads.length === 0) return <EmptyNote>{emptyText}</EmptyNote>;

  return (
    <div
      style={{
        minWidth: 720,
        background: "var(--color-card)",
        border: "1px solid var(--color-line)",
        borderRadius: 13,
        overflow: "hidden",
      }}
    >
      <div
        role="row"
        style={{
          display: "grid",
          gridTemplateColumns: COLUMNS,
          gap: 16,
          padding: "11px 16px",
          background: "#F3F6F8",
          borderBottom: "1px solid var(--color-line)",
        }}
      >
        {["Kunde", "Opgave", "Status", "Opfølgning", "Værdi"].map((heading, i) => (
          <span
            key={heading}
            className="section-label"
            style={{ textAlign: i === 4 ? "right" : "left" }}
          >
            {heading}
          </span>
        ))}
      </div>

      {leads.map((lead) => (
        <button
          key={lead.id}
          type="button"
          onClick={() => openLead(lead.id)}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#F7F9FA")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          style={{
            display: "grid",
            gridTemplateColumns: COLUMNS,
            gap: 16,
            alignItems: "center",
            width: "100%",
            padding: "13px 16px",
            borderBottom: "1px solid var(--color-line-soft)",
            textAlign: "left",
            background: "transparent",
          }}
        >
          <span style={{ minWidth: 0 }}>
            <span
              className="truncate-1"
              style={{
                display: "block",
                fontFamily: "var(--font-display)",
                fontSize: 15,
                fontWeight: 700,
              }}
            >
              {lead.name}
            </span>
            <span
              className="truncate-1"
              style={{
                display: "block",
                fontSize: 12.5,
                color: "var(--color-text-3)",
              }}
            >
              {lead.city ?? "—"}
            </span>
          </span>

          <span
            className="truncate-1"
            style={{ fontSize: 14, color: "var(--color-text-2)", minWidth: 0 }}
          >
            {taskSummary(lead.description, 46) || "—"}
          </span>

          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              fontSize: 13.5,
              color: "var(--color-text-2)",
              minWidth: 0,
            }}
          >
            <StatusDot status={lead.status} />
            <span className="truncate-1">{lead.status}</span>
          </span>

          <span
            style={{
              fontSize: 13,
              fontWeight: lead.follow_up ? 600 : 400,
              color: lead.follow_up
                ? BUCKET_COLORS[followUpBucket(lead.follow_up, now)]
                : "var(--color-text-4)",
            }}
          >
            {lead.follow_up ? followUpLabel(lead.follow_up, now) : "—"}
          </span>

          <span
            style={{
              textAlign: "right",
              fontFamily: "var(--font-display)",
              fontSize: 14,
              fontWeight: 700,
              color: lead.value ? "var(--color-text)" : "var(--color-text-4)",
            }}
          >
            {lead.value ? kr(lead.value) : "—"}
          </span>
        </button>
      ))}
    </div>
  );
}
