"use client";

import { useRef, useState } from "react";
import { useLeads } from "./leads-provider";
import { useAppState } from "./app-state";
import {
  Button,
  Chip,
  EmptyNote,
  Field,
  Input,
  SectionLabel,
  Textarea,
  inputStyle,
} from "./ui";
import { compressImage } from "@/lib/image";
import {
  clockTime,
  displayAddress,
  shortDateTime,
  taskInSentence,
  firstName,
} from "@/lib/format";
import {
  DURATION_UNITS,
  TASK_TAGS,
  type DurationUnit,
  type Lead,
} from "@/lib/types";

/**
 * Sektionerne i lead-detaljen. De er ens på mobil og desktop; kun rammen
 * omkring dem skifter (fuldskærm vs. sidepanel), så de bor her ét sted.
 *
 * Autogem: hvert felt gemmes når det forlades. Der er ingen gem-knap med
 * vilje — undtagen på noter, hvor handlingen tilføjer en ny linje frem for
 * at rette et felt.
 */

const compact = (value: number | null) => (value === null ? "" : String(value));

/* -------------------------------------------------------------------------
   Kontakt & opgave
------------------------------------------------------------------------- */

export function ContactSection({
  lead,
  editing,
  onToggleEdit,
  desktop = false,
}: {
  lead: Lead;
  editing: boolean;
  onToggleEdit: (editing: boolean) => void;
  desktop?: boolean;
}) {
  const { savedAt } = useLeads();
  const saved = savedAt[lead.id];

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, minWidth: 0 }}>
          <SectionLabel>Kontakt &amp; opgave</SectionLabel>
          {saved ? (
            <span
              style={{
                fontSize: 12,
                color: "var(--color-success)",
                whiteSpace: "nowrap",
              }}
            >
              Gemt kl. {clockTime(saved)}
            </span>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => onToggleEdit(!editing)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            minHeight: 40,
            padding: "0 14px",
            borderRadius: "var(--radius-input)",
            background: editing ? "var(--color-yellow)" : "var(--color-card)",
            border: `1px solid ${editing ? "var(--color-yellow)" : "var(--color-line-input)"}`,
            fontFamily: "var(--font-display)",
            fontSize: 14,
            fontWeight: 700,
            color: "var(--color-navy)",
            flexShrink: 0,
          }}
        >
          {editing ? "Færdig" : "✎ Rediger"}
        </button>
      </header>

      {editing ? (
        <EditableContact lead={lead} onDone={() => onToggleEdit(false)} desktop={desktop} />
      ) : (
        <ReadOnlyContact lead={lead} />
      )}
    </section>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 16,
        padding: "11px 0",
        borderBottom: "1px solid var(--color-line-soft)",
      }}
    >
      <span style={{ fontSize: 13, color: "var(--color-text-3)", flexShrink: 0 }}>
        {label}
      </span>
      <span
        style={{
          fontSize: 14.5,
          fontWeight: 600,
          textAlign: "right",
          overflowWrap: "anywhere",
        }}
      >
        {children}
      </span>
    </div>
  );
}

function ReadOnlyContact({ lead }: { lead: Lead }) {
  const linkStyle: React.CSSProperties = {
    color: "var(--color-link)",
    textDecoration: "none",
    fontWeight: 600,
  };

  return (
    <div
      style={{
        background: "var(--color-card)",
        border: "1px solid var(--color-line)",
        borderRadius: "var(--radius-card)",
        padding: "4px 15px 15px",
      }}
    >
      <Row label="Navn">{lead.name}</Row>
      <Row label="Telefon">
        {lead.phone ? (
          <a href={`tel:${lead.phone}`} style={linkStyle}>
            {lead.phone}
          </a>
        ) : (
          <span style={{ color: "var(--color-text-4)", fontWeight: 400 }}>—</span>
        )}
      </Row>
      <Row label="E-mail">
        {lead.email ? (
          <a href={`mailto:${lead.email}`} style={linkStyle}>
            {lead.email}
          </a>
        ) : (
          <span style={{ color: "var(--color-text-4)", fontWeight: 400 }}>—</span>
        )}
      </Row>
      <Row label="Adresse">
        {displayAddress(lead) || (
          <span style={{ color: "var(--color-text-4)", fontWeight: 400 }}>—</span>
        )}
      </Row>

      {lead.description ? (
        <p
          style={{
            margin: "14px 0 0",
            fontSize: 15,
            lineHeight: 1.55,
            color: "var(--color-navy-ink)",
            whiteSpace: "pre-wrap",
            textWrap: "pretty",
          }}
        >
          {lead.description}
        </p>
      ) : null}

      {lead.tags.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 12 }}>
          {lead.tags.map((tag) => (
            <span
              key={tag}
              style={{
                background: "var(--color-yellow-soft)",
                border: "1px solid var(--color-yellow)",
                borderRadius: "var(--radius-pill)",
                padding: "4px 11px",
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      <div
        style={{
          marginTop: 14,
          paddingTop: 12,
          borderTop: "1px solid var(--color-line-soft)",
          display: "flex",
          flexDirection: "column",
          gap: 4,
          fontSize: 12.5,
          color: "var(--color-text-3)",
        }}
      >
        <span>Kilde: {lead.platform ?? "Ukendt"}</span>
        {lead.campaign_name ? <span>Kampagne: {lead.campaign_name}</span> : null}
        {lead.ad_name ? <span>Annonce: {lead.ad_name}</span> : null}
      </div>
    </div>
  );
}

function EditableContact({
  lead,
  onDone,
  desktop,
}: {
  lead: Lead;
  onDone: () => void;
  desktop: boolean;
}) {
  const { updateLead } = useLeads();

  // Lokal kopi mens der skrives; skrives til serveren når feltet forlades.
  const [draft, setDraft] = useState({
    name: lead.name,
    phone: lead.phone ?? "",
    email: lead.email ?? "",
    address: displayAddress(lead),
    description: lead.description ?? "",
  });

  const commit = (field: keyof typeof draft) => {
    const value = draft[field];
    const current =
      field === "address" ? displayAddress(lead) : (lead[field] ?? "");
    if (value === current) return;
    if (field === "name" && !value.trim()) {
      setDraft((d) => ({ ...d, name: lead.name }));
      return;
    }
    void updateLead(lead.id, { [field]: value } as never);
  };

  const toggleTag = (tag: string) => {
    const next = lead.tags.includes(tag)
      ? lead.tags.filter((t) => t !== tag)
      : [...lead.tags, tag];
    void updateLead(lead.id, { tags: next });
  };

  return (
    <div
      style={{
        background: "var(--color-card)",
        // Gul kant er signalet om at kortet er i redigering.
        border: "1px solid var(--color-yellow)",
        borderRadius: "var(--radius-card)",
        padding: 15,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <Field label="Navn">
        <Input
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          onBlur={() => commit("name")}
          style={{ fontWeight: 600 }}
        />
      </Field>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: desktop ? "1fr 1fr" : "1fr 1fr",
          gap: 10,
        }}
      >
        <Field label="Telefon">
          <Input
            type="tel"
            inputMode="tel"
            value={draft.phone}
            onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
            onBlur={() => commit("phone")}
          />
        </Field>
        <Field label="E-mail">
          <Input
            type="email"
            inputMode="email"
            value={draft.email}
            onChange={(e) => setDraft({ ...draft, email: e.target.value })}
            onBlur={() => commit("email")}
          />
        </Field>
      </div>

      <Field label="Adresse" hint="Postnummer og by hentes automatisk">
        <Input
          value={draft.address}
          onChange={(e) => setDraft({ ...draft, address: e.target.value })}
          onBlur={() => commit("address")}
        />
      </Field>

      <Field label="Opgaven">
        <Textarea
          rows={5}
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          onBlur={() => commit("description")}
        />
      </Field>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={{ fontSize: 12.5, color: "var(--color-text-3)" }}>
          Opgavetype
        </span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
          {TASK_TAGS.map((tag) => (
            <Chip
              key={tag}
              selected={lead.tags.includes(tag)}
              onClick={() => toggleTag(tag)}
            >
              {tag}
            </Chip>
          ))}
        </div>
      </div>

      <Button tone="navy" full onClick={onDone}>
        Færdig
      </Button>
    </div>
  );
}

/* -------------------------------------------------------------------------
   Billeder
------------------------------------------------------------------------- */

export function PhotosSection({
  lead,
  columns = 3,
  aspect = "1 / 1",
}: {
  lead: Lead;
  columns?: number;
  aspect?: string;
}) {
  const { registerPhoto, deletePhoto, toast } = useLeads();
  const [busy, setBusy] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);

    try {
      const { getSupabase } = await import("@/lib/supabase/client");
      const supabase = await getSupabase();

      for (const file of Array.from(files)) {
        // Kamerabilleder fra en nyere telefon er 3-6 MB. Komprimér inden
        // upload — ude på en byggeplads er der sjældent godt net.
        const compressed = await compressImage(file);
        const path = `${lead.id}/${crypto.randomUUID()}.jpg`;

        const { error } = await supabase.storage
          .from("lead-photos")
          .upload(path, compressed, { contentType: "image/jpeg" });

        if (error) {
          toast(`Kunne ikke uploade ${file.name}`, "error");
          continue;
        }

        await registerPhoto(lead.id, path, file.name);
      }
    } catch {
      toast("Billedet kunne ikke behandles", "error");
    } finally {
      setBusy(false);
      if (cameraRef.current) cameraRef.current.value = "";
      if (libraryRef.current) libraryRef.current.value = "";
    }
  };

  const photos = lead.photos ?? [];

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <SectionLabel>Billeder</SectionLabel>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Button
          tone="navy"
          disabled={busy}
          onClick={() => cameraRef.current?.click()}
        >
          {busy ? "Uploader…" : "Tag billede"}
        </Button>
        <Button
          tone="chip"
          disabled={busy}
          onClick={() => libraryRef.current?.click()}
        >
          Vælg fra telefon
        </Button>
      </div>

      {/* capture="environment" åbner bagkameraet direkte i stedet for
          et galleri-vælg. */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => void upload(e.target.files)}
      />
      <input
        ref={libraryRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => void upload(e.target.files)}
      />

      {photos.length === 0 ? (
        <EmptyNote>
          Ingen billeder endnu — tag et på stedet eller vælg fra telefonen.
        </EmptyNote>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${columns}, 1fr)`,
            gap: 8,
          }}
        >
          {photos.map((photo) => (
            <div key={photo.id} style={{ position: "relative" }}>
              {/* Signerede Storage-URLs, ikke next/image: bucket'en er privat
                  og URL'en udløber, så optimizeren kan ikke cache dem. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.url}
                alt={photo.original_name ?? "Billede fra sagen"}
                loading="lazy"
                style={{
                  width: "100%",
                  aspectRatio: aspect,
                  objectFit: "cover",
                  borderRadius: 10,
                  display: "block",
                  background: "var(--color-chip)",
                }}
              />
              <button
                type="button"
                aria-label="Slet billede"
                onClick={() => void deletePhoto(lead.id, photo.id, photo.path)}
                style={{
                  position: "absolute",
                  top: 6,
                  right: 6,
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: "rgba(7,34,54,.72)",
                  color: "#fff",
                  fontSize: 15,
                  lineHeight: 1,
                  display: "grid",
                  placeItems: "center",
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------
   Tilbud, tid & opfølgning — altid redigerbar, ligger ikke bag ✎
------------------------------------------------------------------------- */

export function OfferSection({ lead }: { lead: Lead }) {
  const { updateLead, now } = useLeads();

  // Kladden nulstilles ved at hele lead-visningen remounter på lead.id
  // (se key= på MobileLeadScreen og LeadPanel). Den må ikke synkroniseres
  // fra en effect: en revalidering midt i indtastningen ville så overskrive
  // det Meick lige har skrevet.
  const [draft, setDraft] = useState({
    value: compact(lead.value),
    price: compact(lead.price),
    duration: compact(lead.duration_value),
  });

  /** Genvejschips på opfølgning: I morgen / 3 dage / 1 uge. */
  const setFollowUpInDays = (days: number) => {
    const date = new Date(now);
    date.setDate(date.getDate() + days);
    void updateLead(lead.id, { follow_up: date.toISOString().slice(0, 10) });
  };

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <SectionLabel>Tilbud, tid &amp; opfølgning</SectionLabel>

      <div
        style={{
          background: "var(--color-card)",
          border: "1px solid var(--color-line)",
          borderRadius: "var(--radius-card)",
          padding: 15,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Estimeret værdi">
            <Input
              inputMode="numeric"
              placeholder="0"
              value={draft.value}
              onChange={(e) =>
                setDraft({ ...draft, value: e.target.value.replace(/\D/g, "") })
              }
              onBlur={() =>
                void updateLead(lead.id, {
                  value: draft.value === "" ? null : Number(draft.value),
                })
              }
              style={{ fontWeight: 600 }}
            />
          </Field>
          <Field label="Tilbudspris">
            <Input
              inputMode="numeric"
              placeholder="0"
              value={draft.price}
              onChange={(e) =>
                setDraft({ ...draft, price: e.target.value.replace(/\D/g, "") })
              }
              onBlur={() =>
                void updateLead(lead.id, {
                  price: draft.price === "" ? null : Number(draft.price),
                })
              }
              style={{ fontWeight: 600 }}
            />
          </Field>
        </div>

        <Field label="Opgaven udføres" hint="Hvornår arbejdet skal i gang">
          <Input
            type="date"
            value={lead.start_date ?? ""}
            onChange={(e) =>
              void updateLead(lead.id, { start_date: e.target.value || null })
            }
          />
        </Field>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ fontSize: 12.5, color: "var(--color-text-3)" }}>
            Forventet tid
          </span>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input
              inputMode="decimal"
              placeholder="0"
              value={draft.duration}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  duration: e.target.value.replace(/[^\d.,]/g, ""),
                })
              }
              onBlur={() =>
                void updateLead(lead.id, {
                  duration_value:
                    draft.duration === ""
                      ? null
                      : Number(draft.duration.replace(",", ".")),
                })
              }
              style={{ ...inputStyle, width: 84, flexShrink: 0, fontWeight: 600 }}
            />
            {/* flex-wrap og flex-shrink:0 — uden dem får sidepanelet
                vandret scroll. */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
              {DURATION_UNITS.map((unit) => (
                <Chip
                  key={unit}
                  selected={(lead.duration_unit ?? "dage") === unit}
                  onClick={() =>
                    void updateLead(lead.id, { duration_unit: unit as DurationUnit })
                  }
                >
                  {unit}
                </Chip>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ fontSize: 12.5, color: "var(--color-text-3)" }}>
            Følg op den
          </span>
          <Input
            type="date"
            value={lead.follow_up ?? ""}
            onChange={(e) =>
              void updateLead(lead.id, { follow_up: e.target.value || null })
            }
          />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            <Chip onClick={() => setFollowUpInDays(1)}>I morgen</Chip>
            <Chip onClick={() => setFollowUpInDays(3)}>3 dage</Chip>
            <Chip onClick={() => setFollowUpInDays(7)}>1 uge</Chip>
            {lead.follow_up ? (
              <Chip onClick={() => void updateLead(lead.id, { follow_up: null })}>
                Fjern
              </Chip>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------
   Historik
------------------------------------------------------------------------- */

export function HistorySection({ lead }: { lead: Lead }) {
  const activity = lead.activity ?? [];
  if (activity.length === 0) return null;

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <SectionLabel>Historik</SectionLabel>
      <ol
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {activity.map((entry) => (
          <li key={entry.id} style={{ display: "flex", gap: 11 }}>
            <span
              aria-hidden
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "var(--color-yellow)",
                marginTop: 6,
                flexShrink: 0,
              }}
            />
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.45 }}>
                {entry.what}
              </p>
              <p
                style={{
                  margin: "2px 0 0",
                  fontSize: 11.5,
                  color: "var(--color-text-4)",
                }}
              >
                {shortDateTime(entry.created_at)} · {entry.who}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* -------------------------------------------------------------------------
   Korrespondance — kun en henvisning, samtalen bor på Beskeder
------------------------------------------------------------------------- */

/**
 * Én linje der fører til beskedtråden.
 *
 * Her stod hele samtalen før, boble for boble. Det gjorde lead-siden så lang
 * at tilbud, noter og historik forsvandt under den — og en samtale er ikke
 * et felt i en sag, den er sin egen ting. Nu bor den på Beskeder, og leadet
 * nøjes med at sige at den findes.
 */
export function CorrespondenceLink({ lead }: { lead: Lead }) {
  const { openThread } = useAppState();
  const messages = lead.messages ?? [];

  if (messages.length === 0) return null;

  const latest = messages.reduce((a, b) => (b.sent_at > a.sent_at ? b : a));
  const venter = latest.direction === "ind";

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <SectionLabel>Korrespondance</SectionLabel>
      <button
        type="button"
        onClick={() => openThread(lead.id)}
        style={{
          width: "100%",
          textAlign: "left",
          display: "flex",
          alignItems: "center",
          gap: 12,
          minHeight: 56,
          padding: "12px 14px",
          background: "var(--color-card)",
          border: "1px solid var(--color-line)",
          borderLeft: `3px solid ${
            venter ? "var(--color-yellow)" : "var(--color-line)"
          }`,
          borderRadius: "var(--radius-card)",
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <p
            style={{
              margin: 0,
              fontFamily: "var(--font-display)",
              fontSize: 14.5,
              fontWeight: 700,
            }}
          >
            {messages.length} {messages.length === 1 ? "besked" : "beskeder"}
            {venter ? " · venter på svar" : ""}
          </p>
          <p
            style={{
              margin: "2px 0 0",
              fontSize: 12.5,
              color: "var(--color-text-4)",
            }}
          >
            Seneste {shortDateTime(latest.sent_at)}
          </p>
        </div>
        <span aria-hidden style={{ color: "var(--color-text-4)", fontSize: 20 }}>
          ›
        </span>
      </button>
    </section>
  );
}

/* -------------------------------------------------------------------------
   Interne noter — den eneste sektion med en eksplicit gem-knap
------------------------------------------------------------------------- */

export function NotesSection({ lead }: { lead: Lead }) {
  const { addNote, deleteNote } = useLeads();
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!text.trim() || saving) return;
    setSaving(true);
    await addNote(lead.id, text);
    setText("");
    setSaving(false);
  };

  const notes = lead.notes ?? [];

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <SectionLabel>Interne noter</SectionLabel>

      {notes.map((note) => (
        <div
          key={note.id}
          style={{
            background: "#F3F6F8",
            borderLeft: "3px solid var(--color-yellow)",
            borderRadius: "0 10px 10px 0",
            padding: "11px 13px",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 14.5,
              lineHeight: 1.55,
              color: "var(--color-navy-ink)",
              whiteSpace: "pre-wrap",
            }}
          >
            {note.text}
          </p>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              marginTop: 6,
            }}
          >
            <span style={{ fontSize: 11.5, color: "var(--color-text-4)" }}>
              {shortDateTime(note.created_at)} · {note.author}
            </span>
            <button
              type="button"
              onClick={() => void deleteNote(lead.id, note.id)}
              style={{
                fontSize: 12,
                color: "var(--color-text-3)",
                minHeight: 32,
                padding: "0 4px",
              }}
            >
              Slet
            </button>
          </div>
        </div>
      ))}

      <Textarea
        rows={3}
        placeholder="Skriv en note…"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <Button
        tone="navy"
        full
        disabled={!text.trim() || saving}
        onClick={() => void submit()}
      >
        {saving ? "Gemmer…" : "Gem note"}
      </Button>
    </section>
  );
}

/* -------------------------------------------------------------------------
   Handlingsrække — Ring / SMS / Mail / Skabelon
------------------------------------------------------------------------- */

export function ActionRow({
  lead,
  onSms,
  onMail,
  onTemplate,
}: {
  lead: Lead;
  onSms: () => void;
  onMail: () => void;
  onTemplate: () => void;
}) {
  const { logActivity } = useLeads();

  const cellStyle: React.CSSProperties = {
    height: 56,
    display: "grid",
    placeItems: "center",
    fontFamily: "var(--font-display)",
    fontSize: 15,
    fontWeight: 700,
    textDecoration: "none",
  };

  const disabledStyle: React.CSSProperties = { opacity: 0.4, pointerEvents: "none" };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 1,
        background: "var(--color-line)",
      }}
    >
      <a
        href={lead.phone ? `tel:${lead.phone}` : undefined}
        onClick={() => lead.phone && void logActivity(lead.id, "Ringet op")}
        style={{
          ...cellStyle,
          background: "var(--color-yellow)",
          color: "var(--color-navy)",
          ...(lead.phone ? {} : disabledStyle),
        }}
      >
        Ring
      </a>

      <button
        type="button"
        onClick={onSms}
        disabled={!lead.phone}
        style={{
          ...cellStyle,
          background: "var(--color-navy-700)",
          color: "#fff",
          ...(lead.phone ? {} : disabledStyle),
        }}
      >
        SMS
      </button>

      {/* Var et mailto:-link, der overlod mailen til telefonens mailprogram
          og efterlod intet spor. Nu skrives den her og ender i
          korrespondancen. Er SMTP ikke sat op, åbner arket mailprogrammet
          som før — knappen opfører sig altså aldrig værre end den gjorde. */}
      <button
        type="button"
        onClick={onMail}
        disabled={!lead.email}
        style={{
          ...cellStyle,
          background: "var(--color-navy-700)",
          color: "#fff",
          ...(lead.email ? {} : disabledStyle),
        }}
      >
        Skriv mail
      </button>

      <button
        type="button"
        onClick={onTemplate}
        style={{
          ...cellStyle,
          background: "var(--color-navy-700)",
          color: "#fff",
        }}
      >
        Skabelon
      </button>
    </div>
  );
}

/** Erstatter {navn} og {opgave} i en skabelon. */
export function fillTemplate(text: string, lead: Lead): string {
  return text
    .replace(/\{navn\}/g, firstName(lead.name))
    .replace(/\{opgave\}/g, taskInSentence(lead.description));
}

/* -------------------------------------------------------------------------
   Slet lead
------------------------------------------------------------------------- */

/**
 * Ligger nederst, adskilt fra resten og uden farve der trækker øjet til sig.
 * Sletning er sjælden og uigenkaldelig — den skal kunne findes, ikke rammes
 * ved et uheld på vej ned gennem siden.
 */
export function DeleteSection({ onRequestDelete }: { onRequestDelete: () => void }) {
  return (
    <section
      style={{
        marginTop: 8,
        paddingTop: 18,
        borderTop: "1px solid var(--color-line)",
      }}
    >
      <button
        type="button"
        onClick={onRequestDelete}
        style={{
          minHeight: 44,
          padding: "0 14px",
          borderRadius: "var(--radius-input)",
          border: "1px solid var(--color-line-input)",
          background: "var(--color-card)",
          color: "var(--color-danger)",
          fontSize: 14,
          fontWeight: 600,
        }}
      >
        Slet lead
      </button>
      <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "var(--color-text-4)" }}>
        Fjerner leadet og alt der hører til. Kan ikke fortrydes.
      </p>
    </section>
  );
}
