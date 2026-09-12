import { createClient } from "./supabase/server";
import type { Lead, LeadActivity, LeadNote, LeadPhoto } from "./types";

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

  const [leadsResult, notesResult, activityResult, photosResult] =
    await Promise.all([
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
      supabase
        .from("lead_photos")
        .select("*")
        .order("created_at", { ascending: true }),
    ]);

  if (leadsResult.error) throw leadsResult.error;

  const leads = (leadsResult.data ?? []) as Lead[];
  const notes = (notesResult.data ?? []) as LeadNote[];
  const activity = (activityResult.data ?? []) as LeadActivity[];
  const photos = (photosResult.data ?? []) as LeadPhoto[];

  // Bucket'en er privat, så hvert billede skal have en signeret URL med.
  const signedUrls = new Map<string, string>();
  if (photos.length > 0) {
    const { data } = await supabase.storage
      .from("lead-photos")
      .createSignedUrls(
        photos.map((p) => p.path),
        PHOTO_URL_TTL_SECONDS,
      );
    for (const item of data ?? []) {
      if (item.signedUrl && item.path) signedUrls.set(item.path, item.signedUrl);
    }
  }

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
  const activityByLead = group(activity);
  const photosByLead = group(photos);

  return leads.map((lead) => ({
    ...lead,
    notes: notesByLead.get(lead.id) ?? [],
    activity: activityByLead.get(lead.id) ?? [],
    photos: (photosByLead.get(lead.id) ?? []).map((photo) => ({
      ...photo,
      url: signedUrls.get(photo.path),
    })),
  }));
}

/** Den indloggede brugers visningsnavn — bruges som forfatter på noter. */
export async function getCurrentUserName(): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return "Ukendt";
  const metaName = user.user_metadata?.full_name ?? user.user_metadata?.name;
  if (typeof metaName === "string" && metaName.trim()) return metaName.trim();
  return user.email?.split("@")[0] ?? "Ukendt";
}
