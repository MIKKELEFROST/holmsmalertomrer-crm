"use client";

import { useLeads } from "./leads-provider";

/**
 * Toasts. Centreret 86px over bunden på mobil, så bundnavigation og
 * handlingsbar ikke dækker, og 24px på desktop hvor der ikke er nogen.
 */
export function ToastHost() {
  const { toasts } = useLeads();
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      style={{
        position: "fixed",
        left: "50%",
        bottom: "var(--toast-bottom, 86px)",
        transform: "translateX(-50%)",
        zIndex: 90,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        alignItems: "center",
        pointerEvents: "none",
      }}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          style={{
            background:
              toast.tone === "error" ? "var(--color-danger)" : "var(--color-navy)",
            color: "#fff",
            fontSize: 14,
            fontWeight: 600,
            padding: "11px 18px",
            borderRadius: "var(--radius-toast)",
            boxShadow: "var(--shadow-toast)",
            animation: "toast-in .18s ease",
            maxWidth: "calc(100vw - 40px)",
            textAlign: "center",
          }}
        >
          {toast.text}
        </div>
      ))}
    </div>
  );
}
