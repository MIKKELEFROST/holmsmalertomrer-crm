"use client";

import { useMemo } from "react";
import { useLeads } from "./leads-provider";
import { useAppState } from "./app-state";
import { Avatar, EmptyNote, StatusDot } from "./ui";
import { conversations, type Conversation } from "@/lib/derive";
import { initials, relativeTime } from "@/lib/format";

/**
 * Beskeder — alle samtaler ét sted.
 *
 * Uden den her skal man vide hvilket lead en mail hører til for at kunne
 * finde den. Det virker når man leder efter noget bestemt, men ikke når man
 * skal finde ud af hvad der er kommet ind siden i går.
 *
 * Nyeste samtale øverst, og de kunder der venter på svar er markeret. Det er
 * forskellen på en liste og en arbejdsliste.
 */

/** Én linje af beskeden, uden linjeskift, så rækkerne har samme højde. */
function preview(text: string): string {
  const flad = text.replace(/\s+/g, " ").trim();
  return flad.length > 120 ? `${flad.slice(0, 119)}…` : flad || "(tom besked)";
}

function ConversationRow({ row, now }: { row: Conversation; now: Date }) {
  const { openThread } = useAppState();
  const { lead, latest, venterPaaSvar, antal } = row;

  return (
    <li>
      <button
        type="button"
        onClick={() => openThread(lead.id)}
        style={{
          width: "100%",
          textAlign: "left",
          display: "flex",
          gap: 12,
          alignItems: "flex-start",
          background: "var(--color-card)",
          border: "1px solid var(--color-line)",
          // Den gule kant er hele signalet: her skylder du et svar.
          borderLeft: `3px solid ${
            venterPaaSvar ? "var(--color-yellow)" : "var(--color-line)"
          }`,
          borderRadius: "var(--radius-card)",
          padding: "13px 14px",
          minHeight: 72,
        }}
      >
        <Avatar text={initials(lead.name)} />

        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <StatusDot status={lead.status} />
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 15,
                fontWeight: 700,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {lead.name}
            </span>
            <span
              style={{
                marginLeft: "auto",
                fontSize: 11.5,
                color: "var(--color-text-4)",
                whiteSpace: "nowrap",
              }}
            >
              {relativeTime(latest.sent_at, now)}
            </span>
          </div>

          <p
            style={{
              margin: "3px 0 0",
              fontSize: 13.5,
              lineHeight: 1.4,
              color: "var(--color-text-2)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
            }}
          >
            {latest.subject ? <strong>{latest.subject} — </strong> : null}
            {preview(latest.body)}
          </p>

          <p
            style={{
              margin: "4px 0 0",
              fontSize: 11.5,
              color: venterPaaSvar ? "var(--color-navy)" : "var(--color-text-4)",
              fontWeight: venterPaaSvar ? 700 : 400,
            }}
          >
            {venterPaaSvar ? "Venter på svar" : "Du svarede sidst"}
            {" · "}
            {latest.channel === "email" ? "Mail" : "SMS"}
            {antal > 1 ? ` · ${antal} beskeder` : null}
          </p>
        </div>
      </button>
    </li>
  );
}

export function ConversationList() {
  const { leads, now, refreshMail, refreshing } = useLeads();
  const rows = useMemo(() => conversations(leads), [leads]);

  // Knappen står over listen og også når listen er tom: det er netop når der
  // ikke er noget, man vil tjekke om der er kommet noget.
  const hentKnap = (
    <button
      type="button"
      onClick={() => void refreshMail()}
      disabled={refreshing}
      style={{
        alignSelf: "flex-start",
        minHeight: 44,
        padding: "0 16px",
        borderRadius: "var(--radius-pill)",
        background: "var(--color-chip)",
        border: "1px solid var(--color-line)",
        fontFamily: "var(--font-display)",
        fontSize: 13.5,
        fontWeight: 700,
        opacity: refreshing ? 0.6 : 1,
      }}
    >
      {refreshing ? "Henter…" : "Hent nye beskeder"}
    </button>
  );

  if (rows.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {hentKnap}
        <EmptyNote>
          Ingen beskeder endnu. Mails til og fra postkassen lander her af sig
          selv — så snart en af dem kan kobles til et lead.
        </EmptyNote>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {hentKnap}
      <ol
      style={{
        listStyle: "none",
        margin: 0,
        padding: 0,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
        {rows.map((row) => (
          <ConversationRow key={row.lead.id} row={row} now={now} />
        ))}
      </ol>
    </div>
  );
}
