"use client";

import { useState } from "react";
import { useLeads } from "./leads-provider";
import { useAppState } from "./app-state";
import { fillTemplate } from "./lead-sections";
import { Button, Chip, Field, Input, Sheet, StatusDot, Textarea } from "./ui";
import { MANUAL_SOURCES, SMS_TEMPLATES, STATUSES, type Lead, type LeadStatus } from "@/lib/types";

/**
 * Arkene: SMS, skabelon, statusskift og opret lead.
 *
 * Alle fire er bundark på mobil og midterstillede på desktop — samme
 * komponent, fordi indholdet er identisk og kun bredden skifter.
 */

/** Skriver teksten til udklipsholderen. Falder tilbage på det gamle API. */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Safari nægter clipboard uden brugergestus i visse sammenhænge.
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const copied = document.execCommand("copy");
      document.body.removeChild(area);
      return copied;
    } catch {
      return false;
    }
  }
}

/* -------------------------------------------------------------------------
   SMS
------------------------------------------------------------------------- */

export function SmsSheet({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const { logActivity, toast } = useLeads();

  const send = async (label: string | null, text: string) => {
    // Teksten kopieres altid med som fallback: nogle Android-tastaturer
    // dropper body-parameteren i sms:-links.
    await copyToClipboard(text);
    window.location.href = `sms:${lead.phone}?&body=${encodeURIComponent(text)}`;
    await logActivity(lead.id, label ? `SMS sendt — ${label}` : "SMS åbnet");
    toast(label ? `SMS klar: ${label}` : "SMS åbnet");
    onClose();
  };

  return (
    <Sheet title="Send SMS" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingBottom: 8 }}>
        <button
          type="button"
          onClick={() => void send(null, "")}
          style={{
            textAlign: "left",
            background: "var(--color-card)",
            border: "1px solid var(--color-line)",
            borderRadius: "var(--radius-card)",
            padding: "14px 15px",
            minHeight: 56,
            fontFamily: "var(--font-display)",
            fontSize: 15,
            fontWeight: 700,
          }}
        >
          Tom SMS — skriv selv
        </button>

        {SMS_TEMPLATES.map((template) => {
          const text = fillTemplate(template.text, lead);
          return (
            <div
              key={template.label}
              style={{
                background: "var(--color-card)",
                border: "1px solid var(--color-line)",
                borderRadius: "var(--radius-card)",
                padding: 15,
                display: "flex",
                gap: 12,
                alignItems: "flex-start",
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <p
                  style={{
                    margin: 0,
                    fontFamily: "var(--font-display)",
                    fontSize: 15,
                    fontWeight: 700,
                  }}
                >
                  {template.label}
                </p>
                <p
                  style={{
                    margin: "5px 0 0",
                    fontSize: 14,
                    lineHeight: 1.5,
                    color: "var(--color-text-2)",
                    textWrap: "pretty",
                  }}
                >
                  {text}
                </p>
              </div>
              <Button
                tone="yellow"
                height={44}
                style={{ flexShrink: 0 }}
                onClick={() => void send(template.label, text)}
              >
                Send
              </Button>
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}

/* -------------------------------------------------------------------------
   Skabelon — kopierer kun teksten, til mail eller Messenger
------------------------------------------------------------------------- */

export function TemplateSheet({
  lead,
  onClose,
}: {
  lead: Lead;
  onClose: () => void;
}) {
  const { logActivity, toast } = useLeads();

  const copy = async (label: string, text: string) => {
    const copied = await copyToClipboard(text);
    if (copied) {
      await logActivity(lead.id, `Skabelon kopieret — ${label}`);
      toast("Teksten er kopieret");
    } else {
      toast("Kunne ikke kopiere teksten", "error");
    }
    onClose();
  };

  return (
    <Sheet title="Kopiér tekst" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingBottom: 8 }}>
        {SMS_TEMPLATES.map((template) => {
          const text = fillTemplate(template.text, lead);
          return (
            <div
              key={template.label}
              style={{
                background: "var(--color-card)",
                border: "1px solid var(--color-line)",
                borderRadius: "var(--radius-card)",
                padding: 15,
                display: "flex",
                gap: 12,
                alignItems: "flex-start",
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <p
                  style={{
                    margin: 0,
                    fontFamily: "var(--font-display)",
                    fontSize: 15,
                    fontWeight: 700,
                  }}
                >
                  {template.label}
                </p>
                <p
                  style={{
                    margin: "5px 0 0",
                    fontSize: 14,
                    lineHeight: 1.5,
                    color: "var(--color-text-2)",
                    textWrap: "pretty",
                  }}
                >
                  {text}
                </p>
              </div>
              <Button
                tone="chip"
                height={44}
                style={{ flexShrink: 0 }}
                onClick={() => void copy(template.label, text)}
              >
                Kopiér
              </Button>
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}

/* -------------------------------------------------------------------------
   Statusskift
------------------------------------------------------------------------- */

export function StatusSheet({
  lead,
  onClose,
}: {
  lead: Lead;
  onClose: () => void;
}) {
  const { updateLead, toast } = useLeads();

  const pick = async (status: LeadStatus) => {
    onClose();
    if (status === lead.status) return;
    await updateLead(lead.id, { status });
    toast(`${lead.name.split(" ")[0]} → ${status}`);
  };

  return (
    <Sheet title="Skift status" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: 8 }}>
        {STATUSES.map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => void pick(status)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              minHeight: 56,
              padding: "0 15px",
              textAlign: "left",
              background:
                status === lead.status ? "var(--color-yellow)" : "var(--color-card)",
              border: `1px solid ${
                status === lead.status ? "var(--color-yellow)" : "var(--color-line)"
              }`,
              borderRadius: "var(--radius-card)",
              fontFamily: "var(--font-display)",
              fontSize: 16,
              fontWeight: 700,
            }}
          >
            <StatusDot status={status} size={10} />
            {status}
            {status === lead.status ? (
              <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 600 }}>
                Nuværende
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

/* -------------------------------------------------------------------------
   Opret lead
------------------------------------------------------------------------- */

export function NewLeadSheet({ onClose }: { onClose: () => void }) {
  const { createLead, toast } = useLeads();
  const { openLead } = useAppState();

  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    description: "",
    source: MANUAL_SOURCES[0] as string,
  });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!form.name.trim()) {
      toast("Skriv mindst et navn", "error");
      return;
    }
    setSaving(true);
    const leadId = await createLead(form);
    setSaving(false);

    if (leadId) {
      onClose();
      // Nye leads åbner direkte i redigering — resten udfyldes typisk mens
      // kunden stadig er i røret.
      openLead(leadId);
    }
  };

  return (
    <Sheet title="Nyt lead" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingBottom: 8 }}>
        <Field label="Navn">
          <Input
            autoFocus
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            style={{ fontWeight: 600 }}
          />
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Telefon">
            <Input
              type="tel"
              inputMode="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </Field>
          <Field label="E-mail">
            <Input
              type="email"
              inputMode="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>
        </div>

        <Field label="Adresse" hint="Postnummer og by hentes automatisk">
          <Input
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
        </Field>

        <Field label="Opgaven">
          <Textarea
            rows={4}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </Field>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ fontSize: 12.5, color: "var(--color-text-3)" }}>Kilde</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {MANUAL_SOURCES.map((source) => (
              <Chip
                key={source}
                selected={form.source === source}
                onClick={() => setForm({ ...form, source })}
              >
                {source}
              </Chip>
            ))}
          </div>
        </div>

        <Button
          tone="yellow"
          full
          height={52}
          disabled={saving}
          onClick={() => void submit()}
        >
          {saving ? "Opretter…" : "Opret lead"}
        </Button>
      </div>
    </Sheet>
  );
}
