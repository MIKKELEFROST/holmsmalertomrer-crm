"use client";

import { useEffect, useRef } from "react";
import { STATUS_COLORS, type LeadStatus } from "@/lib/types";

/* -------------------------------------------------------------------------
   Statusprik — statusfarverne bruges kun her og på kanban-striber,
   aldrig som tekstfarve.
------------------------------------------------------------------------- */

export function StatusDot({
  status,
  size = 8,
}: {
  status: LeadStatus;
  size?: number;
}) {
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: STATUS_COLORS[status],
        flexShrink: 0,
        display: "inline-block",
      }}
    />
  );
}

/* -------------------------------------------------------------------------
   Statuschip — trykbar, viser prik + navn
------------------------------------------------------------------------- */

export function StatusChip({
  status,
  onClick,
  onNavy = false,
}: {
  status: LeadStatus;
  onClick?: () => void;
  onNavy?: boolean;
}) {
  const Element = onClick ? "button" : "span";
  return (
    <Element
      type={onClick ? "button" : undefined}
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        padding: "6px 12px",
        borderRadius: "var(--radius-pill)",
        background: onNavy ? "var(--color-navy-700)" : "var(--color-chip)",
        color: onNavy ? "#fff" : "var(--color-text-2)",
        border: onNavy ? "1px solid var(--color-navy-500)" : "1px solid transparent",
        fontSize: 13,
        fontWeight: 500,
        minHeight: onClick ? 32 : undefined,
        whiteSpace: "nowrap",
      }}
    >
      <StatusDot status={status} />
      {status}
    </Element>
  );
}

/* -------------------------------------------------------------------------
   Sektionslabel
------------------------------------------------------------------------- */

export function SectionLabel({
  children,
  color,
}: {
  children: React.ReactNode;
  color?: string;
}) {
  return (
    <span className="section-label" style={color ? { color } : undefined}>
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------------
   Bundark
   Bruges til SMS, skabeloner, statusskift og opret lead.
------------------------------------------------------------------------- */

export function Sheet({
  title,
  onClose,
  children,
  maxWidth,
  action,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: number;
  action?: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Escape lukker, og fokus flyttes ind i arket så tastaturbrugere ikke
  // bliver stående bagved.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    panelRef.current?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        background: "rgba(7,34,54,.55)",
        animation: "fade-in .15s ease",
      }}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: maxWidth ?? 520,
          maxHeight: "80vh",
          overflowY: "auto",
          background: "var(--color-surface)",
          borderRadius: "var(--radius-sheet) var(--radius-sheet) 0 0",
          animation: "sheet-up .22s cubic-bezier(.22,.61,.36,1)",
          outline: "none",
          paddingBottom: "max(20px, env(safe-area-inset-bottom))",
        }}
      >
        {/* Greb-streg — signalerer at arket kan lukkes */}
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 4px" }}>
          <span
            aria-hidden
            style={{
              width: 38,
              height: 4,
              borderRadius: 2,
              background: "var(--color-line-input)",
            }}
          />
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "6px 20px 14px",
          }}
        >
          <h2
            style={{
              margin: 0,
              fontFamily: "var(--font-display)",
              fontSize: 20,
              fontWeight: 700,
            }}
          >
            {title}
          </h2>
          {action ?? (
            <button
              type="button"
              onClick={onClose}
              style={{
                fontSize: 15,
                color: "var(--color-text-3)",
                minHeight: 44,
                padding: "0 4px",
              }}
            >
              Annullér
            </button>
          )}
        </div>

        <div style={{ padding: "0 20px" }}>{children}</div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
   Knapper
------------------------------------------------------------------------- */

type ButtonTone = "yellow" | "navy" | "chip" | "outline";

const TONE_STYLES: Record<ButtonTone, React.CSSProperties> = {
  yellow: { background: "var(--color-yellow)", color: "var(--color-navy)" },
  navy: { background: "var(--color-navy)", color: "#fff" },
  chip: { background: "var(--color-chip)", color: "var(--color-text)" },
  outline: {
    background: "var(--color-card)",
    color: "var(--color-text)",
    border: "1px solid var(--color-line-input)",
  },
};

export function Button({
  tone = "yellow",
  full,
  height = 48,
  style,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: ButtonTone;
  full?: boolean;
  height?: number;
}) {
  return (
    <button
      {...props}
      style={{
        ...TONE_STYLES[tone],
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        minHeight: height,
        padding: "0 18px",
        width: full ? "100%" : undefined,
        borderRadius: "var(--radius-btn)",
        fontFamily: "var(--font-display)",
        fontSize: 15,
        fontWeight: 700,
        opacity: props.disabled ? 0.5 : 1,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------
   Felter
------------------------------------------------------------------------- */

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 12.5, color: "var(--color-text-3)" }}>{label}</span>
      {children}
      {hint ? (
        <span style={{ fontSize: 12, color: "var(--color-text-4)" }}>{hint}</span>
      ) : null}
    </label>
  );
}

/** 16px skriftstørrelse på mobil er bevidst — under det zoomer iOS ind. */
export const inputStyle: React.CSSProperties = {
  background: "var(--color-field)",
  border: "1px solid var(--color-line-input)",
  borderRadius: "var(--radius-input)",
  padding: "11px 12px",
  fontSize: 16,
  minHeight: 44,
  width: "100%",
};

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} style={{ ...inputStyle, ...props.style }} />;
}

export function Textarea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>,
) {
  return (
    <textarea
      {...props}
      style={{
        ...inputStyle,
        minHeight: 96,
        resize: "vertical",
        lineHeight: 1.55,
        ...props.style,
      }}
    />
  );
}

/** Valgbar chip — opgavetyper, enheder, kilder, postnumre. */
export function Chip({
  selected,
  onNavy = false,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  selected?: boolean;
  onNavy?: boolean;
}) {
  const background = selected
    ? "var(--color-yellow)"
    : onNavy
      ? "var(--color-navy-700)"
      : "var(--color-chip)";

  return (
    <button
      type="button"
      {...props}
      style={{
        background,
        color: selected ? "var(--color-navy)" : onNavy ? "var(--color-on-navy-3)" : "var(--color-text-2)",
        border: `1px solid ${
          selected
            ? "var(--color-yellow)"
            : onNavy
              ? "var(--color-navy-500)"
              : "transparent"
        }`,
        borderRadius: "var(--radius-pill)",
        padding: "0 14px",
        minHeight: 36,
        fontSize: 13.5,
        fontWeight: selected ? 600 : 500,
        whiteSpace: "nowrap",
        flexShrink: 0,
        ...props.style,
      }}
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------
   Kort
------------------------------------------------------------------------- */

export function Card({
  children,
  style,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      style={{
        background: "var(--color-card)",
        border: "1px solid var(--color-line)",
        borderRadius: "var(--radius-card)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Initial-avatar på leadkortene. */
export function Avatar({ text, size = 40 }: { text: string; size?: number }) {
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: 10,
        background: "var(--color-chip)",
        display: "grid",
        placeItems: "center",
        fontFamily: "var(--font-display)",
        fontSize: size * 0.375,
        fontWeight: 700,
        color: "var(--color-text-2)",
      }}
    >
      {text}
    </span>
  );
}

/* -------------------------------------------------------------------------
   Tom tilstand
------------------------------------------------------------------------- */

export function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        margin: 0,
        padding: "18px 16px",
        border: "1px dashed var(--color-line-input)",
        borderRadius: "var(--radius-card)",
        color: "var(--color-text-3)",
        fontSize: 14,
        textAlign: "center",
      }}
    >
      {children}
    </p>
  );
}
