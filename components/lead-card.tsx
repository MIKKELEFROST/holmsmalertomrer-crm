"use client";

import { useLeads } from "./leads-provider";
import { useAppState } from "./app-state";
import { Avatar, StatusDot } from "./ui";
import { nextStatus } from "@/lib/derive";
import {
  followUpBucket,
  followUpLabel,
  initials,
  joinParts,
  kr,
  relativeTime,
  taskSummary,
} from "@/lib/format";
import type { Lead } from "@/lib/types";

const BUCKET_COLORS = {
  overskredet: "var(--color-danger)",
  uge: "var(--color-warn)",
  senere: "var(--color-text-2)",
} as const;

/** Farvet opfølgnings-badge. */
export function FollowUpBadge({ lead, now }: { lead: Lead; now: Date }) {
  if (!lead.follow_up) return null;
  const color = BUCKET_COLORS[followUpBucket(lead.follow_up, now)];

  return (
    <span
      style={{
        fontSize: 12,
        fontWeight: 600,
        color,
        whiteSpace: "nowrap",
      }}
    >
      {followUpLabel(lead.follow_up, now)}
    </span>
  );
}

/**
 * Leadkort til mobilens lister.
 *
 * Fodrækken har en trykbar statuschip og en "→ næste status"-knap. Pilene der
 * oprindeligt sad her blev fjernet i designet, fordi det ikke var tydeligt
 * hvor leadet røg hen — destinationen skal stå med ord.
 */
export function MobileLeadCard({
  lead,
  onStatusTap,
}: {
  lead: Lead;
  onStatusTap: (lead: Lead) => void;
}) {
  const { now, updateLead, toast } = useLeads();
  const { openLead } = useAppState();
  const next = nextStatus(lead.status);

  const advance = async () => {
    if (!next) return;
    await updateLead(lead.id, { status: next });
    toast(`${lead.name.split(" ")[0]} → ${next}`);
  };

  return (
    <article
      style={{
        background: "var(--color-card)",
        border: "1px solid var(--color-line)",
        borderRadius: "var(--radius-card)",
        padding: 15,
      }}
    >
      <button
        type="button"
        onClick={() => openLead(lead.id)}
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          width: "100%",
          textAlign: "left",
          minHeight: 44,
        }}
      >
        <Avatar text={initials(lead.name)} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <span
              className="truncate-1"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 16.5,
                fontWeight: 700,
                minWidth: 0,
              }}
            >
              {lead.name}
            </span>
            <span
              style={{
                fontSize: 11.5,
                color: "var(--color-text-4)",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              {relativeTime(lead.created_time, now)}
            </span>
          </div>
          <p
            className="truncate-1"
            style={{
              margin: "2px 0 0",
              fontSize: 13.5,
              color: "var(--color-text-2)",
            }}
          >
            {joinParts([taskSummary(lead.description), lead.city]) || "Ingen opgavetekst"}
          </p>
        </div>
      </button>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginTop: 12,
          paddingTop: 11,
          borderTop: "1px solid var(--color-line-soft)",
        }}
      >
        <button
          type="button"
          onClick={() => onStatusTap(lead)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            minHeight: 44,
            padding: "0 12px",
            borderRadius: "var(--radius-pill)",
            background: "var(--color-chip)",
            fontSize: 13,
            fontWeight: 600,
            color: "var(--color-text-2)",
            flexShrink: 0,
          }}
        >
          <StatusDot status={lead.status} />
          {lead.status}
        </button>

        {lead.value ? (
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 13.5,
              fontWeight: 700,
              color: "var(--color-text-2)",
            }}
          >
            {kr(lead.value)}
          </span>
        ) : null}

        <FollowUpBadge lead={lead} now={now} />

        {next ? (
          <button
            type="button"
            onClick={() => void advance()}
            style={{
              marginLeft: "auto",
              minHeight: 44,
              padding: "0 12px",
              borderRadius: "var(--radius-input)",
              background: "var(--color-navy-700)",
              color: "#fff",
              fontFamily: "var(--font-display)",
              fontSize: 13,
              fontWeight: 700,
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            → {next}
          </button>
        ) : null}
      </div>
    </article>
  );
}
