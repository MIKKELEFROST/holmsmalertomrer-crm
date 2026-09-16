import { createClient } from "./supabase/server";
import type { Lead, LeadActivity, LeadNote, LeadPhoto, Message } from "./types";

/** Hvor længe en signeret billed-URL holder. Rigeligt til en arbejdsdag. */
const PHOTO_URL_TTL_SECONDS = 60 * 60 * 8;

/**
 * Henter alle leads med noter, historik og billeder.
 *
 * Alt hentes på én gang og filtreres i browseren. Med et par hundrede leads
 * er det hurtigere end at spørge serveren for hvert filterklik, og det gør
 * søgning og postnummer-chips øjeblikkelige ude i bilen på et dårligt net.
 * Skal det en dag op i tusinder, er det her der skal sideinddeles.
 */
export async function getLeads(): Promise<Lead[]> {
  const supabase = await createClient();

  // Billederne og deres signerede URLs er én kæde for sig: signeringen skal
  // vente på billedrækkerne, men ikke på leads, noter og historik. Lå den
  // efter et samlet Promise.all, ville den koste en ekstra rundtur til
  // databasen i serie med de andre.
  const withPhotoUrls = (async () => {
    const { data } = await supabase
      .from("lead_photos")
      .select("*")
      .order("created_at", { ascending: true });

    const photos = (data ?? []) as LeadPhoto[];
    const signedUrls = new Map<string, string>();

    // Bucket'en er privat, så hvert billede skal have en signeret URL med.
    if (photos.length > 0) {
      const { data: signed } = await supabase.storage
        .from("lead-photos")
        .createSignedUrls(
          photos.map((p) => p.path),
          PHOTO_URL_TTL_SECONDS,
        );
      for (const item of signed ?? []) {
        if (item.signedUrl && item.path) {
          signedUrls.set(item.path, item.signedUrl);
        }
      }
    }

    return { photos, signedUrls };
  })();

  const [
    leadsResult,
    notesResult,
    activityResult,
    messagesResult,
    { photos, signedUrls },
  ] = await Promise.all([
      supabase
        .from("leads")
        .select("*")
        .order("created_time", { ascending: false }),
      supabase
        .from("lead_notes")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("lead_activity")
        .select("*")
        .order("created_at", { ascending: false }),
      // Korrespondancen læses stigende: en samtale giver kun mening oppefra
      // og ned, modsat noter og historik hvor det nyeste skal stå øverst.
      supabase
        .from("messages")
        .select("*")
        .not("lead_id", "is", null)
        .order("sent_at", { ascending: true }),
      withPhotoUrls,
    ]);

  if (leadsResult.error) throw leadsResult.error;

  const leads = (leadsResult.data ?? []) as Lead[];
  const notes = (notesResult.data ?? []) as LeadNote[];
  const activity = (activityResult.data ?? []) as LeadActivity[];
  const messages = (messagesResult.data ?? []) as Message[];

  const group = <T extends { lead_id: string }>(rows: T[]) => {
    const map = new Map<string, T[]>();
    for (const row of rows) {
      const list = map.get(row.lead_id);
      if (list) list.push(row);
      else map.set(row.lead_id, [row]);
    }
    return map;
  };

  const notesByLead = group(notes);
  // lead_id er null-bar i skemaet, men rækkerne er filtreret ovenfor.
  const messagesByLead = group(messages as (Message & { lead_id: string })[]);
  const activityByLead = group(activity);
  const photosByLead = group(photos);

  return leads.map((lead) => ({
    ...lead,
    notes: notesByLead.get(lead.id) ?? [],
    activity: activityByLead.get(lead.id) ?? [],
    messages: messagesByLead.get(lead.id) ?? [],
    photos: (photosByLead.get(lead.id) ?? []).map((photo) => ({
      ...photo,
      url: signedUrls.get(photo.path),
    })),
  }));
}

/**
 * Den indloggede brugers visningsnavn — bruges som forfatter på noter.
 *
 * getClaims() frem for getUser(). getUser() spørger altid Supabases
 * auth-server, altså en netværksrundtur hver eneste gang navnet skal bruges
 * — ved hver sideindlæsning og ved hver skrivning. getClaims() verificerer
 * i stedet token'ets signatur lokalt: projektet signerer med ES256, og den
 * offentlige nøgle hentes én gang pr. serverinstans og genbruges derefter.
 * Samme sikkerhed, ingen rundtur.
 */
export async function getCurrentUserName(): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) return "Ukendt";

  const metadata = claims.user_metadata as Record<string, unknown> | undefined;
  const metaName = metadata?.full_name ?? metadata?.name;
  if (typeof metaName === "string" && metaName.trim()) return metaName.trim();

  const email = typeof claims.email === "string" ? claims.email : null;
  return email?.split("@")[0] ?? "Ukendt";
}

/**
 * Signerer én billed-URL. Bruges når et nyt billede lige er uploadet, så det
 * kan vises med det samme uden at hente hele siden forfra.
 */
export async function signPhotoUrl(
  supabase: Awaited<ReturnType<typeof createClient>>,
  path: string,
): Promise<string | undefined> {
  const { data } = await supabase.storage
    .from("lead-photos")
    .createSignedUrl(path, PHOTO_URL_TTL_SECONDS);
  return data?.signedUrl;
}
