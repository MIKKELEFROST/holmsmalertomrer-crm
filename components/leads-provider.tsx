"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createClient } from "@/lib/supabase/client";
import {
  addNote as addNoteAction,
  createLead as createLeadAction,
  deleteLead as deleteLeadAction,
  deleteNote as deleteNoteAction,
  deletePhoto as deletePhotoAction,
  logActivity as logActivityAction,
  registerPhoto as registerPhotoAction,
  updateLead as updateLeadAction,
  type ActionResult,
  type LeadPatch,
  type NewLeadInput,
} from "@/app/actions";
import type { Lead, LeadActivity } from "@/lib/types";

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
  updateLead: (leadId: string, patch: LeadPatch) => Promise<void>;
  addNote: (leadId: string, text: string) => Promise<void>;
  deleteNote: (leadId: string, noteId: string) => Promise<void>;
  createLead: (input: NewLeadInput) => Promise<string | null>;
  deleteLead: (leadId: string) => Promise<boolean>;
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

  /**
   * Lægger historikposter serveren lige har skabt ind i det lokale lead.
   *
   * Serveren returnerer de faktiske rækker, så det er ikke et gæt om hvad
   * den skrev — det er id'erne og tidsstemplerne fra databasen. Nyeste
   * først, samme rækkefølge som når siden hentes forfra.
   */
  const mergeActivity = useCallback(
    (leadId: string, rows: LeadActivity[] | undefined) => {
      if (!rows?.length) return;
      setLeads((current) =>
        current.map((lead) =>
          lead.id === leadId
            ? { ...lead, activity: [...rows, ...(lead.activity ?? [])] }
            : lead,
        ),
      );
    },
    [],
  );

  /**
   * Kalder en server action og oversætter et netværkssvigt til det samme
   * svar som serveren selv ville have givet.
   *
   * Uden det her kaster et mistet netværk ud af kaldet: tælleren for
   * igangværende skrivninger bliver hængende, den optimistiske ændring
   * rulles aldrig tilbage, og feltet ser gemt ud. Meick står i en kælder
   * uden dækning og tror prisen er noteret. Det er den fejl der gør mest
   * skade, fordi den er tavs.
   */
  const run = useCallback(
    async <T extends ActionResult>(
      action: () => Promise<T>,
    ): Promise<Partial<T> & ActionResult> => {
      inFlight.current++;
      try {
        return await action();
      } catch {
        // Ingen af de rækker handlingen ellers ville returnere findes her —
        // der nåede aldrig at komme et svar. Castet siger netop det: kun
        // ok og error er sat.
        return { ok: false, error: "Ingen forbindelse — prøv igen" } as Partial<T> &
          ActionResult;
      } finally {
        inFlight.current--;
      }
    },
    [],
  );

  const updateLead = useCallback(
    async (leadId: string, patch: LeadPatch) => {
      const before = leads.find((l) => l.id === leadId);
      if (!before) return;

      // Optimistisk: skriv med det samme, rul tilbage hvis serveren afviser.
      patchLocal(leadId, patch as Partial<Lead>);
      const result = await run(() => updateLeadAction(leadId, patch));

      if (!result.ok) {
        patchLocal(leadId, before);
        toast(result.error ?? "Kunne ikke gemme", "error");
        return;
      }

      // Historikposterne kommer med i svaret, så de kan lægges ind uden at
      // hente siden forfra.
      mergeActivity(leadId, result.activity);

      setSavedAt((current) => ({
        ...current,
        [leadId]: new Date().toISOString(),
      }));
    },
    [leads, mergeActivity, patchLocal, run, toast],
  );

  const addNote = useCallback(
    async (leadId: string, text: string) => {
      const result = await run(() => addNoteAction(leadId, text));

      if (!result.ok || !result.note) {
        toast(result.error ?? "Kunne ikke gemme noten", "error");
        return;
      }

      const note = result.note;
      setLeads((current) =>
        current.map((lead) =>
          lead.id === leadId
            ? { ...lead, notes: [note, ...(lead.notes ?? [])] }
            : lead,
        ),
      );
      toast("Note gemt");
    },
    [run, toast],
  );

  const deleteNote = useCallback(
    async (leadId: string, noteId: string) => {
      const before = leads.find((l) => l.id === leadId)?.notes;
      patchLocal(leadId, { notes: before?.filter((n) => n.id !== noteId) });

      const result = await run(() => deleteNoteAction(noteId));

      if (!result.ok) {
        // Sæt noten tilbage — ellers ser den slettet ud uden at være det.
        patchLocal(leadId, { notes: before });
        toast(result.error ?? "Kunne ikke slette noten", "error");
      }
    },
    [leads, patchLocal, run, toast],
  );

  const createLead = useCallback(
    async (input: NewLeadInput) => {
      const result = await run(() => createLeadAction(input));

      if (!result.ok || !result.lead) {
        toast(result.error ?? "Kunne ikke oprette leadet", "error");
        return null;
      }

      // Hele rækken kommer med tilbage, så leadet kan lægges i listen med det
      // samme. Realtime leverer den samme indsættelse et øjeblik efter og
      // springer den over, fordi id'et allerede er der.
      const lead = result.lead;
      setLeads((current) =>
        current.some((l) => l.id === lead.id) ? current : [lead, ...current],
      );
      toast("Lead oprettet");
      return lead.id;
    },
    [run, toast],
  );

  const deleteLead = useCallback(
    async (leadId: string) => {
      const lead = leads.find((l) => l.id === leadId);
      const result = await run(() => deleteLeadAction(leadId));

      if (!result.ok) {
        toast(result.error ?? "Kunne ikke slette leadet", "error");
        return false;
      }

      setLeads((current) => current.filter((l) => l.id !== leadId));
      toast(lead ? `${lead.name} er slettet` : "Leadet er slettet");
      return true;
    },
    [leads, run, toast],
  );

  const logActivity = useCallback(
    async (leadId: string, what: string) => {
      const result = await run(() => logActivityAction(leadId, what));
      mergeActivity(leadId, result.activity ? [result.activity] : undefined);
    },
    [mergeActivity, run],
  );

  const registerPhoto = useCallback(
    async (leadId: string, path: string, originalName: string | null) => {
      const result = await run(() =>
        registerPhotoAction(leadId, path, originalName),
      );

      if (!result.ok || !result.photo) {
        toast(result.error ?? "Kunne ikke gemme billedet", "error");
        return;
      }

      // Billedet kommer tilbage med en signeret URL, så det kan vises med det
      // samme — bucket'en er privat, og uden URL ville feltet stå tomt indtil
      // næste gang siden blev hentet.
      const photo = result.photo;
      setLeads((current) =>
        current.map((lead) =>
          lead.id === leadId
            ? { ...lead, photos: [...(lead.photos ?? []), photo] }
            : lead,
        ),
      );
      mergeActivity(leadId, result.activity ? [result.activity] : undefined);
    },
    [mergeActivity, run, toast],
  );

  const deletePhoto = useCallback(
    async (leadId: string, photoId: string, path: string) => {
      const before = leads.find((l) => l.id === leadId)?.photos;
      patchLocal(leadId, { photos: before?.filter((p) => p.id !== photoId) });

      const result = await run(() => deletePhotoAction(photoId, path));

      if (!result.ok) {
        patchLocal(leadId, { photos: before });
        toast(result.error ?? "Kunne ikke slette billedet", "error");
      }
    },
    [leads, patchLocal, run, toast],
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
      updateLead,
      addNote,
      deleteNote,
      createLead,
      deleteLead,
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
      updateLead,
      addNote,
      deleteNote,
      createLead,
      deleteLead,
      logActivity,
      registerPhoto,
      deletePhoto,
      toast,
      toasts,
    ],
  );

  return <LeadsContext value={value}>{children}</LeadsContext>;
}
