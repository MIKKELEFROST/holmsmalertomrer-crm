"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { createClient } from "@/lib/supabase/client";
import {
  addNote as addNoteAction,
  createLead as createLeadAction,
  deleteNote as deleteNoteAction,
  deletePhoto as deletePhotoAction,
  logActivity as logActivityAction,
  registerPhoto as registerPhotoAction,
  updateLead as updateLeadAction,
  type LeadPatch,
  type NewLeadInput,
} from "@/app/actions";
import type { Lead } from "@/lib/types";

interface Toast {
  id: number;
  text: string;
  tone: "normal" | "error";
}

interface LeadsContextValue {
  leads: Lead[];
  /** Serverens tidspunkt ved sideindlæsning, tikker hvert minut derefter.
   *  Alt relativ tid regnes ud fra den, så server og klient er enige. */
  now: Date;
  currentUser: string;
  /** Sat mens en skrivning er undervejs — driver "Gemt kl. …". */
  savedAt: Record<string, string>;
  pending: boolean;
  updateLead: (leadId: string, patch: LeadPatch) => Promise<void>;
  addNote: (leadId: string, text: string) => Promise<void>;
  deleteNote: (leadId: string, noteId: string) => Promise<void>;
  createLead: (input: NewLeadInput) => Promise<string | null>;
  logActivity: (leadId: string, what: string) => Promise<void>;
  registerPhoto: (
    leadId: string,
    path: string,
    originalName: string | null,
  ) => Promise<void>;
  deletePhoto: (leadId: string, photoId: string, path: string) => Promise<void>;
  toast: (text: string, tone?: "normal" | "error") => void;
  toasts: Toast[];
}

const LeadsContext = createContext<LeadsContextValue | null>(null);

export function useLeads() {
  const context = useContext(LeadsContext);
  if (!context) throw new Error("useLeads skal bruges inde i LeadsProvider");
  return context;
}

/** Ét enkelt lead, eller undefined hvis id'et ikke findes. */
export function useLead(leadId: string | null): Lead | undefined {
  const { leads } = useLeads();
  return useMemo(
    () => (leadId ? leads.find((l) => l.id === leadId) : undefined),
    [leads, leadId],
  );
}

export function LeadsProvider({
  initialLeads,
  serverNow,
  currentUser,
  children,
}: {
  initialLeads: Lead[];
  serverNow: string;
  currentUser: string;
  children: React.ReactNode;
}) {
  const [leads, setLeads] = useState(initialLeads);
  const [now, setNow] = useState(() => new Date(serverNow));
  const [savedAt, setSavedAt] = useState<Record<string, string>>({});
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pending, startTransition] = useTransition();
  const toastId = useRef(0);

  // Serverens data vinder når siden revalideres, men kun hvis vi ikke selv
  // har en skrivning i luften — ellers hopper feltet tilbage under fingeren.
  const inFlight = useRef(0);
  useEffect(() => {
    if (inFlight.current === 0) setLeads(initialLeads);
  }, [initialLeads]);

  // Relativ tid ("2 t. siden") skal ikke fryse fast på en side der står åben
  // hele dagen i bilen.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const toast = useCallback((text: string, tone: "normal" | "error" = "normal") => {
    const id = ++toastId.current;
    setToasts((current) => [...current, { id, text, tone }]);
    setTimeout(
      () => setToasts((current) => current.filter((t) => t.id !== id)),
      2200,
    );
  }, []);

  /** Retter ét lead i den lokale liste. */
  const patchLocal = useCallback((leadId: string, patch: Partial<Lead>) => {
    setLeads((current) =>
      current.map((lead) => (lead.id === leadId ? { ...lead, ...patch } : lead)),
    );
  }, []);

  const updateLead = useCallback(
    async (leadId: string, patch: LeadPatch) => {
      const before = leads.find((l) => l.id === leadId);
      if (!before) return;

      // Optimistisk: skriv med det samme, rul tilbage hvis serveren afviser.
      patchLocal(leadId, patch as Partial<Lead>);
      inFlight.current++;

      const result = await updateLeadAction(leadId, patch);
      inFlight.current--;

      if (!result.ok) {
        patchLocal(leadId, before);
        toast(result.error ?? "Kunne ikke gemme", "error");
        return;
      }

      setSavedAt((current) => ({
        ...current,
        [leadId]: new Date().toISOString(),
      }));
      startTransition(() => {});
    },
    [leads, patchLocal, toast],
  );

  const addNote = useCallback(
    async (leadId: string, text: string) => {
      inFlight.current++;
      const result = await addNoteAction(leadId, text);
      inFlight.current--;

      if (!result.ok) {
        toast(result.error ?? "Kunne ikke gemme noten", "error");
        return;
      }
      toast("Note gemt");
      startTransition(() => {});
    },
    [toast],
  );

  const deleteNote = useCallback(
    async (leadId: string, noteId: string) => {
      patchLocal(leadId, {
        notes: leads
          .find((l) => l.id === leadId)
          ?.notes?.filter((n) => n.id !== noteId),
      });
      inFlight.current++;
      const result = await deleteNoteAction(noteId);
      inFlight.current--;

      if (!result.ok) toast(result.error ?? "Kunne ikke slette noten", "error");
      startTransition(() => {});
    },
    [leads, patchLocal, toast],
  );

  const createLead = useCallback(
    async (input: NewLeadInput) => {
      inFlight.current++;
      const result = await createLeadAction(input);
      inFlight.current--;

      if (!result.ok || !result.leadId) {
        toast(result.error ?? "Kunne ikke oprette leadet", "error");
        return null;
      }
      toast("Lead oprettet");
      startTransition(() => {});
      return result.leadId;
    },
    [toast],
  );

  const logActivity = useCallback(async (leadId: string, what: string) => {
    inFlight.current++;
    await logActivityAction(leadId, what);
    inFlight.current--;
    startTransition(() => {});
  }, []);

  const registerPhoto = useCallback(
    async (leadId: string, path: string, originalName: string | null) => {
      inFlight.current++;
      const result = await registerPhotoAction(leadId, path, originalName);
      inFlight.current--;

      if (!result.ok) toast(result.error ?? "Kunne ikke gemme billedet", "error");
      startTransition(() => {});
    },
    [toast],
  );

  const deletePhoto = useCallback(
    async (leadId: string, photoId: string, path: string) => {
      patchLocal(leadId, {
        photos: leads
          .find((l) => l.id === leadId)
          ?.photos?.filter((p) => p.id !== photoId),
      });
      inFlight.current++;
      const result = await deletePhotoAction(photoId, path);
      inFlight.current--;

      if (!result.ok) toast(result.error ?? "Kunne ikke slette billedet", "error");
      startTransition(() => {});
    },
    [leads, patchLocal, toast],
  );

  // Et nyt Meta-lead skal poppe ind uden refresh — det bliver koldt på timer.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("leads-changes")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "leads" },
        (payload) => {
          const incoming = payload.new as Lead;
          setLeads((current) => {
            if (current.some((l) => l.id === incoming.id)) return current;
            toast(`Nyt lead: ${incoming.name}`);
            return [
              { ...incoming, notes: [], activity: [], photos: [] },
              ...current,
            ];
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [toast]);

  const value = useMemo<LeadsContextValue>(
    () => ({
      leads,
      now,
      currentUser,
      savedAt,
      pending,
      updateLead,
      addNote,
      deleteNote,
      createLead,
      logActivity,
      registerPhoto,
      deletePhoto,
      toast,
      toasts,
    }),
    [
      leads,
      now,
      currentUser,
      savedAt,
      pending,
      updateLead,
      addNote,
      deleteNote,
      createLead,
      logActivity,
      registerPhoto,
      deletePhoto,
      toast,
      toasts,
    ],
  );

  return <LeadsContext value={value}>{children}</LeadsContext>;
}
