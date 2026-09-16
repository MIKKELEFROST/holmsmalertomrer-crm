"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserName, signPhotoUrl } from "@/lib/leads";
import { cityForZip } from "@/lib/postal-codes";
import { displayDate, kr, parseAddress } from "@/lib/format";
import { sendSms, smsConfigured } from "@/lib/gatewayapi";
import { sendMail, smtpConfigured } from "@/lib/smtp";
import { syncMail } from "@/lib/imap";
import { serviceClient } from "@/lib/messages";
import {
  DURATION_UNITS,
  STATUSES,
  type DurationUnit,
  type Lead,
  type LeadActivity,
  type LeadNote,
  type LeadPhoto,
  type LeadStatus,
  type Message,
} from "@/lib/types";

/**
 * Ingen af handlingerne her kalder revalidatePath("/").
 *
 * Det gjorde de før, og det kostede: siden er en server component, så hvert
 * eneste autogem hentede alle leads, noter, historik og billeder forfra og
 * sendte hele træet ned igen — for at ændre ét tal. Ved et blur pr. felt
 * bliver det til en fuld genindlæsning flere gange i minuttet.
 *
 * I stedet returnerer hver handling de rækker den har skabt, og klienten
 * fletter dem ind i den liste den allerede har. Det er ikke et gæt om hvad
 * serveren mon gjorde — det er de rigtige rækker med deres rigtige id'er og
 * tidsstempler. Ved en almindelig genindlæsning af siden hentes alt forfra
 * som før; ruten er dynamisk, så der er intet cache-lag at holde rent.
 */

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/** Rækker serveren skabte undervejs, så klienten kan flette dem ind. */
export interface UpdateLeadResult extends ActionResult {
  activity?: LeadActivity[];
}

export interface AddNoteResult extends ActionResult {
  note?: LeadNote;
}

export interface RefreshMailResult extends ActionResult {
  /** Beskeder synkroniseringen hentede lige nu. Kan være tom. */
  messages?: Message[];
  /** Mails der ikke kunne kobles til et lead. Vises ikke, men tælles. */
  udenMatch?: number;
}

export interface SendEmailResult extends ActionResult {
  message?: Message;
  /**
   * SMTP er ikke sat op. Klienten åbner mailprogrammet med mailto: som før —
   * så kan der stadig skrives, det bliver bare ikke logget.
   */
  fallback?: boolean;
  /** Mailen er sendt, men kopien nåede ikke Meicks egen Sendt-mappe. */
  ikkeGemtISendt?: boolean;
}

export interface SendSmsResult extends ActionResult {
  message?: Message;
  /**
   * GatewayAPI er ikke sat op endnu. Klienten åbner telefonens egen SMS-app
   * som før — beskeden bliver ikke logget, men den kan sendes.
   */
  fallback?: boolean;
}

export interface LogActivityResult extends ActionResult {
  activity?: LeadActivity;
}

export interface CreateLeadResult extends ActionResult {
  lead?: Lead;
}

export interface RegisterPhotoResult extends ActionResult {
  photo?: LeadPhoto;
  activity?: LeadActivity;
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
): Promise<UpdateLeadResult> {
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

  if (logLines.length === 0) return ok;

  // .select() koster ikke en ekstra rundtur — PostgREST sender de oprettede
  // rækker med i svaret på selve indsættelsen.
  const who = await getCurrentUserName();
  const { data: created } = await supabase
    .from("lead_activity")
    .insert(logLines.map((what) => ({ lead_id: leadId, what, who })))
    .select();

  return { ok: true, activity: (created ?? []) as LeadActivity[] };
}

/** Tilføjer en intern note. Den eneste handling med en eksplicit gem-knap. */
export async function addNote(
  leadId: string,
  text: string,
): Promise<AddNoteResult> {
  const trimmed = text.trim();
  if (!trimmed) return fail("Noten er tom");

  const supabase = await createClient();
  const author = await getCurrentUserName();

  const { data, error } = await supabase
    .from("lead_notes")
    .insert({ lead_id: leadId, text: trimmed.slice(0, 5000), author })
    .select()
    .single();

  if (error || !data) return fail(error?.message ?? "Kunne ikke gemme noten");

  return { ok: true, note: data as LeadNote };
}

export async function deleteNote(noteId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("lead_notes").delete().eq("id", noteId);
  if (error) return fail(error.message);
  return ok;
}

/** Skriver en hændelse i historikken — fx at der er sendt en SMS. */
export async function logActivity(
  leadId: string,
  what: string,
): Promise<LogActivityResult> {
  const supabase = await createClient();
  const who = await getCurrentUserName();

  const { data, error } = await supabase
    .from("lead_activity")
    .insert({ lead_id: leadId, what: what.slice(0, 500), who })
    .select()
    .single();

  if (error || !data) return fail(error?.message ?? "Kunne ikke skrive historik");

  return { ok: true, activity: data as LeadActivity };
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
): Promise<CreateLeadResult> {
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
    .select()
    .single();

  if (error || !data) return fail(error?.message ?? "Kunne ikke oprette leadet");

  const { data: created } = await supabase
    .from("lead_activity")
    .insert({
      lead_id: data.id,
      what: `Lead oprettet manuelt (${input.source})`,
      who,
    })
    .select()
    .single();

  // Hele rækken tilbage, ikke bare id'et: så kan klienten lægge leadet ind i
  // listen med det samme frem for at vente på at hele siden hentes forfra.
  const lead: Lead = {
    ...(data as Lead),
    notes: [],
    activity: created ? [created as LeadActivity] : [],
    photos: [],
  };

  return { ok: true, lead };
}

/** Registrerer et uploadet billede. Selve filen er lagt i Storage af klienten. */
export async function registerPhoto(
  leadId: string,
  path: string,
  originalName: string | null,
): Promise<RegisterPhotoResult> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("lead_photos")
    .insert({ lead_id: leadId, path, original_name: originalName })
    .select()
    .single();

  if (error || !data) return fail(error?.message ?? "Kunne ikke gemme billedet");

  // Bucket'en er privat, så billedet skal have en signeret URL med tilbage —
  // ellers kunne klienten ikke vise det den lige har uploadet.
  const [url, logged] = await Promise.all([
    signPhotoUrl(supabase, path),
    logActivity(leadId, "Billede tilføjet"),
  ]);

  return {
    ok: true,
    photo: { ...(data as LeadPhoto), url },
    activity: logged.activity,
  };
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

  return ok;
}

/* -------------------------------------------------------------------------
   SMS
------------------------------------------------------------------------- */

/**
 * Sender en SMS til leadet og skriver den i korrespondancen.
 *
 * Rækkefølgen er vigtig: der sendes først, og gemmes derefter. Gemte vi først,
 * ville en SMS der aldrig kom af sted stå i korrespondancen som sendt — og så
 * er logget værre end intet, fordi man tror man har svaret kunden.
 *
 * Er GatewayAPI ikke sat op, sendes der ikke noget herfra. Klienten får
 * fallback: true og åbner telefonens SMS-app, præcis som CRM'et gjorde før.
 */
export async function sendSmsToLead(
  leadId: string,
  text: string,
): Promise<SendSmsResult> {
  const trimmed = text.trim();
  if (!trimmed) return fail("Beskeden er tom");

  if (!smsConfigured()) return { ok: false, fallback: true };

  const supabase = await createClient();

  // Nummeret hentes fra databasen frem for at komme med fra klienten. Ellers
  // ville et manipuleret kald kunne sende SMS'er til et vilkårligt nummer for
  // Holms regning.
  const { data: lead, error: lookupError } = await supabase
    .from("leads")
    .select("phone")
    .eq("id", leadId)
    .maybeSingle();

  if (lookupError) return fail(lookupError.message);
  if (!lead?.phone) return fail("Leadet har ikke noget telefonnummer");

  let sent: Awaited<ReturnType<typeof sendSms>>;
  try {
    sent = await sendSms(lead.phone, trimmed);
  } catch (error) {
    const besked = error instanceof Error ? error.message : String(error);
    console.error("SMS kunne ikke sendes:", besked);
    return fail(besked);
  }

  const { data, error } = await supabase
    .from("messages")
    .insert({
      lead_id: leadId,
      channel: "sms",
      direction: "ud",
      external_id: sent.id,
      counterparty: lead.phone,
      body: trimmed,
      sent_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error || !data) {
    // Beskeden ER sendt. At den ikke kunne gemmes må ikke se ud som om den
    // ikke blev sendt — så ville den blive sendt igen.
    console.error("SMS sendt, men ikke gemt:", error?.message);
    return {
      ok: true,
      error: "SMS'en blev sendt, men kunne ikke skrives i korrespondancen",
    };
  }

  return { ok: true, message: data as Message };
}

/* -------------------------------------------------------------------------
   Mail
------------------------------------------------------------------------- */

/**
 * Sender en mail til leadet og skriver den i korrespondancen.
 *
 * Samme rækkefølge som ved SMS: der sendes først, og gemmes derefter. En mail
 * der aldrig kom af sted må ikke stå i korrespondancen som sendt.
 *
 * external_id er det Message-ID mailen faktisk blev sendt med. Når
 * IMAP-synkroniseringen om få minutter finder kopien i Sendt-mappen, genkender
 * den det og springer den over — ellers ville hver sendt mail stå to gange.
 */
export async function sendEmailToLead(
  leadId: string,
  subject: string,
  body: string,
): Promise<SendEmailResult> {
  const trimmed = body.trim();
  if (!trimmed) return fail("Mailen er tom");

  if (!smtpConfigured()) return { ok: false, fallback: true };

  const supabase = await createClient();

  // Adressen hentes fra databasen, ikke fra klienten. Ellers kunne et
  // manipuleret kald sende mails til hvem som helst fra Holms adresse.
  const { data: lead, error: lookupError } = await supabase
    .from("leads")
    .select("email")
    .eq("id", leadId)
    .maybeSingle();

  if (lookupError) return fail(lookupError.message);
  if (!lead?.email) return fail("Leadet har ingen mailadresse");

  let sent: Awaited<ReturnType<typeof sendMail>>;
  try {
    sent = await sendMail(lead.email, subject, trimmed);
  } catch (error) {
    const besked = error instanceof Error ? error.message : String(error);
    console.error("Mail kunne ikke sendes:", besked);
    return fail(besked);
  }

  const { data, error } = await supabase
    .from("messages")
    .insert({
      lead_id: leadId,
      channel: "email",
      direction: "ud",
      external_id: sent.messageId,
      counterparty: lead.email,
      subject: subject.trim() || null,
      body: trimmed,
      sent_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error || !data) {
    // Mailen ER sendt. At den ikke kunne gemmes må ikke se ud som en fejl,
    // for så bliver den sendt igen.
    console.error("Mail sendt, men ikke gemt:", error?.message);
    return {
      ok: true,
      error: "Mailen blev sendt, men kunne ikke skrives i korrespondancen",
    };
  }

  return {
    ok: true,
    message: data as Message,
    ikkeGemtISendt: !sent.gemtISendt,
  };
}

/* -------------------------------------------------------------------------
   Hent nye mails nu
------------------------------------------------------------------------- */

/**
 * Kører mailsynkroniseringen med det samme, uden at vente på cron.
 *
 * Cron kører hvert 5. minut, og det er rigeligt til daglig drift. Men står
 * man og venter på et svar fra en kunde, er fem minutter lang tid — og
 * alternativet er at genindlæse siden og håbe.
 *
 * Kalder syncMail direkte frem for at gå gennem HTTP-endpointet: det er den
 * samme server, så en tur ud på nettet og tilbage ville kun tilføje en
 * hemmelighed at håndtere og en fejlkilde.
 */
export async function refreshMail(): Promise<RefreshMailResult> {
  const supabase = await createClient();

  // Proxyen kræver allerede en session for at nå hertil, men en server action
  // skal kunne stå alene: den er et endpoint som alle andre.
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return fail("Du er ikke logget ind");

  // Tidspunktet tages før kørslen, så vi kan finde præcis de rækker den
  // skabte. Realtime sender dem også, men et svar man kan stole på er bedre
  // end et svar der plejer at komme.
  const start = new Date().toISOString();

  let report: Awaited<ReturnType<typeof syncMail>>;
  try {
    report = await syncMail(serviceClient());
  } catch (error) {
    const besked = error instanceof Error ? error.message : String(error);
    console.error("Manuel mailsynkronisering fejlede:", besked);
    return fail(besked);
  }

  const fejl = report.mapper.find((m) => m.fejl !== null);
  if (fejl) return fail(`${fejl.folder}: ${fejl.fejl}`);

  const { data } = await supabase
    .from("messages")
    .select("*")
    .gte("created_at", start)
    .order("sent_at", { ascending: true });

  return {
    ok: true,
    messages: (data ?? []) as Message[],
    udenMatch: report.mapper.reduce((sum, m) => sum + m.udenMatch, 0),
  };
}
