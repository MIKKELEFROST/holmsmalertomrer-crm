"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserName } from "@/lib/leads";
import { cityForZip } from "@/lib/postal-codes";
import { displayDate, kr, parseAddress } from "@/lib/format";
import {
  DURATION_UNITS,
  STATUSES,
  type DurationUnit,
  type Lead,
  type LeadStatus,
} from "@/lib/types";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const ok: ActionResult = { ok: true };
const fail = (error: string): ActionResult => ({ ok: false, error });

/** Felter klienten må skrive til. Alt andet ignoreres. */
const WRITABLE_FIELDS = [
  "name",
  "email",
  "phone",
  "address",
  "description",
  "tags",
  "value",
  "price",
  "start_date",
  "duration_value",
  "duration_unit",
  "follow_up",
  "status",
] as const;

type WritableField = (typeof WRITABLE_FIELDS)[number];
export type LeadPatch = Partial<Pick<Lead, WritableField>>;

/**
 * Menneskelig beskrivelse af en ændring, til historikken.
 *
 * Kun forretningsrelevante felter logges. Rettelser i navn, mail og
 * beskrivelse er korrekturer, ikke hændelser, og ville drukne historikken.
 */
function describeChange(
  field: WritableField,
  value: unknown,
  previous: Lead,
): string | null {
  switch (field) {
    case "status":
      return `Status ændret fra ${previous.status} til ${value}`;
    case "value":
      return value ? `Estimat sat til ${kr(Number(value))}` : "Estimat fjernet";
    case "price":
      return value
        ? `Tilbudspris sat til ${kr(Number(value))}`
        : "Tilbudspris fjernet";
    case "follow_up":
      return value
        ? `Opfølgning sat til ${displayDate(String(value))}`
        : "Opfølgning fjernet";
    case "start_date":
      return value
        ? `Opgaven planlagt til ${displayDate(String(value))}`
        : "Startdato fjernet";
    case "tags": {
      const tags = Array.isArray(value) ? value : [];
      return tags.length
        ? `Opgavetype sat til ${tags.join(", ")}`
        : "Opgavetyper fjernet";
    }
    default:
      return null;
  }
}

/** Renser og validerer én feltværdi. Returnerer undefined hvis den er ugyldig. */
function coerce(field: WritableField, raw: unknown): unknown | undefined {
  switch (field) {
    case "status":
      return STATUSES.includes(raw as LeadStatus) ? raw : undefined;

    case "duration_unit":
      if (raw === null || raw === "") return null;
      return DURATION_UNITS.includes(raw as DurationUnit) ? raw : undefined;

    case "value":
    case "price": {
      if (raw === null || raw === "") return null;
      const n = Math.round(Number(raw));
      return Number.isFinite(n) && n >= 0 ? n : undefined;
    }

    case "duration_value": {
      if (raw === null || raw === "") return null;
      const n = Number(raw);
      return Number.isFinite(n) && n > 0 ? n : undefined;
    }

    case "start_date":
    case "follow_up": {
      if (raw === null || raw === "") return null;
      const s = String(raw);
      return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined;
    }

    case "tags": {
      if (!Array.isArray(raw)) return undefined;
      return raw.filter((t): t is string => typeof t === "string").slice(0, 20);
    }

    case "name": {
      const s = String(raw ?? "").trim();
      return s.length > 0 ? s.slice(0, 200) : undefined;
    }

    default: {
      if (raw === null) return null;
      const s = String(raw ?? "").trim();
      return s === "" ? null : s.slice(0, 5000);
    }
  }
}

/**
 * Gemmer ændringer på et lead og skriver de relevante af dem i historikken.
 *
 * Kaldes ved blur på hvert felt, så den skal være billig og tåle at blive
 * kaldt med en værdi der ikke har ændret sig.
 */
export async function updateLead(
  leadId: string,
  patch: LeadPatch,
): Promise<ActionResult> {
  const supabase = await createClient();

  const { data: existing, error: readError } = await supabase
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .single();

  if (readError || !existing) return fail("Leadet blev ikke fundet");
  const previous = existing as Lead;

  const updates: Record<string, unknown> = {};
  const logLines: string[] = [];

  for (const field of WRITABLE_FIELDS) {
    if (!(field in patch)) continue;

    const value = coerce(field, patch[field]);
    if (value === undefined) return fail(`Ugyldig værdi i feltet ${field}`);

    // Spring over hvis værdien er uændret — ellers logger vi tomme hændelser.
    const current = previous[field];
    const unchanged = Array.isArray(value)
      ? JSON.stringify([...value].sort()) ===
        JSON.stringify([...((current as string[]) ?? [])].sort())
      : value === current;
    if (unchanged) continue;

    updates[field] = value;

    const line = describeChange(field, value, previous);
    if (line) logLines.push(line);
  }

  // Rettes adressen, følger postnummer og by med, så filtrene bliver ved
  // med at passe.
  if (typeof updates.address === "string") {
    const { zip, city } = parseAddress(updates.address);
    if (zip) {
      updates.zip = zip;
      updates.city = city ?? cityForZip(zip);
    }
  }

  if (Object.keys(updates).length === 0) return ok;

  const { error } = await supabase.from("leads").update(updates).eq("id", leadId);
  if (error) return fail(error.message);

  if (logLines.length > 0) {
    const who = await getCurrentUserName();
    await supabase.from("lead_activity").insert(
      logLines.map((what) => ({ lead_id: leadId, what, who })),
    );
  }

  revalidatePath("/");
  return ok;
}

/** Tilføjer en intern note. Den eneste handling med en eksplicit gem-knap. */
export async function addNote(
  leadId: string,
  text: string,
): Promise<ActionResult> {
  const trimmed = text.trim();
  if (!trimmed) return fail("Noten er tom");

  const supabase = await createClient();
  const author = await getCurrentUserName();

  const { error } = await supabase
    .from("lead_notes")
    .insert({ lead_id: leadId, text: trimmed.slice(0, 5000), author });

  if (error) return fail(error.message);

  revalidatePath("/");
  return ok;
}

export async function deleteNote(noteId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("lead_notes").delete().eq("id", noteId);
  if (error) return fail(error.message);
  revalidatePath("/");
  return ok;
}

/** Skriver en hændelse i historikken — fx at der er sendt en SMS. */
export async function logActivity(
  leadId: string,
  what: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const who = await getCurrentUserName();

  const { error } = await supabase
    .from("lead_activity")
    .insert({ lead_id: leadId, what: what.slice(0, 500), who });

  if (error) return fail(error.message);
  revalidatePath("/");
  return ok;
}

export interface NewLeadInput {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  description?: string;
  source: string;
}

/**
 * Opretter et lead i hånden — typisk mens Meick har kunden i røret.
 * Kun navnet er påkrævet; resten kan udfyldes bagefter.
 */
export async function createLead(
  input: NewLeadInput,
): Promise<ActionResult & { leadId?: string }> {
  const name = input.name.trim();
  if (!name) return fail("Skriv mindst et navn");

  const supabase = await createClient();
  const who = await getCurrentUserName();
  const address = input.address?.trim() || null;
  const { zip, city } = address
    ? parseAddress(address)
    : { zip: null, city: null };

  const { data, error } = await supabase
    .from("leads")
    .insert({
      name: name.slice(0, 200),
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      address,
      zip,
      city: city ?? cityForZip(zip),
      description: input.description?.trim() || null,
      platform: input.source,
      campaign_name: "Oprettet manuelt",
      status: "Nye",
    })
    .select("id")
    .single();

  if (error || !data) return fail(error?.message ?? "Kunne ikke oprette leadet");

  await supabase.from("lead_activity").insert({
    lead_id: data.id,
    what: `Lead oprettet manuelt (${input.source})`,
    who,
  });

  revalidatePath("/");
  return { ok: true, leadId: data.id };
}

/** Registrerer et uploadet billede. Selve filen er lagt i Storage af klienten. */
export async function registerPhoto(
  leadId: string,
  path: string,
  originalName: string | null,
): Promise<ActionResult> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("lead_photos")
    .insert({ lead_id: leadId, path, original_name: originalName });

  if (error) return fail(error.message);

  await logActivity(leadId, "Billede tilføjet");
  revalidatePath("/");
  return ok;
}

export async function deletePhoto(
  photoId: string,
  path: string,
): Promise<ActionResult> {
  const supabase = await createClient();

  const { error } = await supabase.from("lead_photos").delete().eq("id", photoId);
  if (error) return fail(error.message);

  // Rækken er væk uanset hvad; en forældreløs fil i Storage er til at leve
  // med, mens et billede der bliver hængende i UI'et ikke er.
  await supabase.storage.from("lead-photos").remove([path]);

  revalidatePath("/");
  return ok;
}

/**
 * Sletter et lead med alt hvad der hænger på det.
 *
 * Noter, historik og billedrækker forsvinder af sig selv — de har
 * `on delete cascade` i skemaet. Selve billedfilerne i Storage gør ikke, så
 * de hentes og fjernes først; ellers ville de ligge tilbage som forældreløse
 * kopier af kundens hus, uden nogen vej til at finde dem igen.
 *
 * Det er en rigtig sletning, ikke et flag. En kunde der beder om at få sine
 * oplysninger fjernet, skal have dem fjernet.
 */
export async function deleteLead(leadId: string): Promise<ActionResult> {
  const supabase = await createClient();

  const { data: photos } = await supabase
    .from("lead_photos")
    .select("path")
    .eq("lead_id", leadId);

  const paths = (photos ?? []).map((p) => p.path as string);
  if (paths.length > 0) {
    // Fejler filsletningen, fortsætter vi alligevel. Et lead der bliver
    // hængende i CRM'et er værre end en glemt fil i en privat bucket.
    const { error: storageError } = await supabase.storage
      .from("lead-photos")
      .remove(paths);
    if (storageError) {
      console.error("Kunne ikke slette billedfiler:", storageError.message);
    }
  }

  const { error } = await supabase.from("leads").delete().eq("id", leadId);
  if (error) return fail(error.message);

  revalidatePath("/");
  return ok;
}
