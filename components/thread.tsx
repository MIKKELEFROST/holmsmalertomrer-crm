"use client";

import { useState } from "react";
import { useLeads } from "./leads-provider";
import { useAppState } from "./app-state";
import { MailSheet, SmsSheet } from "./sheets";
import { EmptyNote, StatusDot } from "./ui";
import { shortDateTime } from "@/lib/format";
import type { Lead, Message } from "@/lib/types";

/**
 * Beskedtråden — én samtale, alene.
 *
 * Lå før som en sektion nede i lead-detaljen, mellem tilbud og historik. Det
 * var forkert sted: et lead er en sag med pris, status og noter, og en
 * samtale er noget andet. Sammen blev lead-siden så lang at samtalen
 * druknede i den.
 *
 * Her er der kun samtalen, og handlingerne er dem man faktisk har brug for
 * midt i en: svare, og slå op i sagen.
 */

function MessageBubble({ message }: { message: Message }) {
  const outgoing = message.direction === "ud";

  return (
    <li
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: outgoing ? "flex-end" : "flex-start",
        gap: 3,
      }}
    >
      <div
        style={{
          maxWidth: "85%",
          minWidth: 0,
          background: outgoing ? "var(--color-yellow-soft)" : "var(--color-card)",
          border: "1px solid var(--color-line)",
          borderRadius: "var(--radius-card)",
          padding: "11px 13px",
        }}
      >
        {message.subject ? (
          <p
            style={{
              margin: "0 0 4px",
              fontFamily: "var(--font-display)",
              fontSize: 13,
              fontWeight: 700,
              lineHeight: 1.35,
            }}
          >
            {message.subject}
          </p>
        ) : null}
        <p
          style={{
            margin: 0,
            fontSize: 14.5,
            lineHeight: 1.5,
            // Mails kommer med deres egne linjeskift. Uden den her står hele
            // brevet som én klump.
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
          }}
        >
          {message.body || "(tom besked)"}
        </p>
      </div>
      <p style={{ margin: 0, fontSize: 11.5, color: "var(--color-text-4)" }}>
        {message.channel === "email" ? "Mail" : "SMS"} ·{" "}
        {outgoing ? "sendt" : "modtaget"} · {shortDateTime(message.sent_at)}
      </p>
    </li>
  );
}

export function ThreadView({
  lead,
  bottomPadding = 28,
}: {
  lead: Lead;
  bottomPadding?: number;
}) {
  const { closeThread, openLead } = useAppState();
  const { refreshMail, refreshing } = useLeads();
  const [sheet, setSheet] = useState<"mail" | "sms" | null>(null);

  const messages = [...(lead.messages ?? [])].sort((a, b) =>
    a.sent_at.localeCompare(b.sent_at),
  );

  return (
    <>
      <header style={{ background: "var(--color-navy)", padding: "20px 20px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            type="button"
            onClick={closeThread}
            style={{
              color: "var(--color-on-navy-2)",
              fontSize: 14,
              minHeight: 44,
              display: "flex",
              alignItems: "center",
            }}
          >
            ‹ Beskeder
          </button>

          {/* Hentes nu frem for at vente på cron. Fem minutter er ingenting
              til daglig, men lang tid når man står og venter på et svar. */}
          <button
            type="button"
            onClick={() => void refreshMail()}
            disabled={refreshing}
            style={{
              marginLeft: "auto",
              minHeight: 44,
              padding: "0 14px",
              borderRadius: "var(--radius-pill)",
              background: "var(--color-navy-700)",
              border: "1px solid var(--color-navy-500)",
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              opacity: refreshing ? 0.6 : 1,
            }}
          >
            {refreshing ? "Henter…" : "Hent nye"}
          </button>
        </div>

        <h1
          style={{
            margin: "6px 0 0",
            fontFamily: "var(--font-display)",
            fontSize: 22,
            fontWeight: 800,
            color: "#fff",
          }}
        >
          {lead.name}
        </h1>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            marginTop: 4,
          }}
        >
          <StatusDot status={lead.status} />
          <span style={{ fontSize: 12.5, color: "var(--color-on-navy-2)" }}>
            {lead.status}
            {lead.email ? ` · ${lead.email}` : ""}
          </span>
        </div>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 1,
          background: "var(--color-line)",
        }}
      >
        <button
          type="button"
          onClick={() => setSheet("mail")}
          disabled={!lead.email}
          style={{
            height: 52,
            background: "var(--color-yellow)",
            color: "var(--color-navy)",
            fontFamily: "var(--font-display)",
            fontSize: 15,
            fontWeight: 700,
            ...(lead.email ? {} : { opacity: 0.4, pointerEvents: "none" }),
          }}
        >
          Skriv mail
        </button>
        <button
          type="button"
          onClick={() => setSheet("sms")}
          disabled={!lead.phone}
          style={{
            height: 52,
            background: "var(--color-navy-700)",
            color: "#fff",
            fontFamily: "var(--font-display)",
            fontSize: 15,
            fontWeight: 700,
            ...(lead.phone ? {} : { opacity: 0.4, pointerEvents: "none" }),
          }}
        >
          SMS
        </button>
        {/* Midt i en samtale vil man tit slå prisen eller adressen op. Uden
            den her skulle man gå tilbage, skifte fane og søge leadet frem. */}
        <button
          type="button"
          onClick={() => openLead(lead.id)}
          style={{
            height: 52,
            background: "var(--color-navy-700)",
            color: "#fff",
            fontFamily: "var(--font-display)",
            fontSize: 15,
            fontWeight: 700,
          }}
        >
          Åbn lead
        </button>
      </div>

      <main style={{ padding: `18px 20px ${bottomPadding}px`, flex: 1 }}>
        {messages.length === 0 ? (
          <EmptyNote>
            Ingen beskeder i denne tråd endnu.
          </EmptyNote>
        ) : (
          <ol
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
          </ol>
        )}
      </main>

      {sheet === "mail" ? (
        <MailSheet lead={lead} onClose={() => setSheet(null)} />
      ) : null}
      {sheet === "sms" ? (
        <SmsSheet lead={lead} onClose={() => setSheet(null)} />
      ) : null}
    </>
  );
}
