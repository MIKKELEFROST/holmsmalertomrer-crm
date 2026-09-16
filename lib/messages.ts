import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseUrl } from "./env";
import type { MessageChannel, MessageDirection } from "./types";

/**
 * Kernen i korrespondance-logget: tag en mail eller SMS udefra, find ud af
 * hvilket lead den hører til, og gem den én gang.
 *
 * Delt mellem IMAP-synkroniseringen og GatewayAPI-webhooken, fordi de to
 * kanaler har nøjagtig samme to problemer — matchning og dubletter — og det
 * ville være to steder at rette den dag reglerne ændrer sig.
 */

/** Længste tekst vi gemmer. En mailtråd med hele historikken citeret kan fylde
 *  hundredtusindvis af tegn; det er ikke værd at slæbe rundt på i browseren. */
const MAX_BODY = 20_000;
const MAX_SUBJECT = 500;

export interface InboundMessage {
  channel: MessageChannel;
  direction: MessageDirection;
  /** Afsenderens egen id — Message-ID eller GatewayAPI's beskedid. */
  externalId: string;
  /** Modpartens mailadresse eller telefonnummer. */
  counterparty: string;
  subject?: string | null;
  body: string;
  sentAt: Date;
  /**
   * Kassér beskeden hvis den ikke kan matches til et lead.
   *
   * Sat for mail, ikke for SMS. Mailen ligger stadig i Meicks egen postkasse,
   * så en mail der ikke matcher, er ikke tabt — den er bare ikke i CRM'et, og
   * CRM'et slipper for at være en kopi af hans nyhedsbreve og fakturaer.
   * SMS'erne har ikke det sikkerhedsnet: de kommer ind på et nummer der kun
   * findes her, så de skal gemmes uanset hvad og ses i Uafklaret.
   */
  requireLead?: boolean;
}

export interface StoreResult {
  id: string | null;
  leadId: string | null;
  duplicate: boolean;
  /** Kasseret uden match, fordi requireLead var sat. */
  skipped: boolean;
}

/**
 * Supabase-klient med service role.
 *
 * Nødvendig her, fordi ingest-endpointene kaldes af maskiner uden
 * brugersession — og fordi RLS på mail_sync_state med vilje ikke giver nogen
 * adgang. Nøglen forlader aldrig serveren.
 */
export function serviceClient(): SupabaseClient {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY mangler. Sæt den i Vercel under Settings → " +
        "Environment Variables. Uden den kan indkommende beskeder ikke gemmes.",
    );
  }
  return createClient(supabaseUrl(), key, { auth: { persistSession: false } });
}

/**
 * Finder leadet en besked hører til, eller null.
 *
 * Null er et gyldigt svar, ikke en fejl: en mail fra en der ikke er i CRM'et
 * skal stadig gemmes, så den kan ses i Uafklaret. Kasserede vi den, ville
 * hullet være usynligt.
 */
export async function findLead(
  supabase: SupabaseClient,
  channel: MessageChannel,
  counterparty: string,
): Promise<string | null> {
  const fn = channel === "email" ? "lead_for_email" : "lead_for_phone";
  const arg = channel === "email" ? { addr: counterparty } : { raw: counterparty };

  const { data, error } = await supabase.rpc(fn, arg);
  if (error) {
    console.error(`Opslag i ${fn} fejlede:`, error.message);
    return null;
  }
  return (data as string | null) ?? null;
}

/**
 * Gemmer en besked. Har vi den i forvejen, sker der ingenting.
 *
 * Dubletter er reglen, ikke undtagelsen: synkroniseringen kører forfra når
 * UIDVALIDITY nulstilles, GatewayAPI genudsender webhooks der ikke blev
 * kvitteret, og et genforsøg efter en timeout henter det samme igen. Unique
 * på (channel, external_id) i databasen er det der holder — ikke et tjek her,
 * som to samtidige kørsler ville kunne løbe forbi hinanden i.
 */
export async function storeMessage(
  supabase: SupabaseClient,
  message: InboundMessage,
): Promise<StoreResult> {
  const leadId = await findLead(supabase, message.channel, message.counterparty);

  if (!leadId && message.requireLead) {
    return { id: null, leadId: null, duplicate: false, skipped: true };
  }

  const { data, error } = await supabase
    .from("messages")
    .upsert(
      {
        lead_id: leadId,
        channel: message.channel,
        direction: message.direction,
        external_id: message.externalId,
        counterparty: message.counterparty.trim().slice(0, 320),
        subject: message.subject?.trim().slice(0, MAX_SUBJECT) || null,
        body: message.body.slice(0, MAX_BODY),
        sent_at: message.sentAt.toISOString(),
      },
      { onConflict: "channel,external_id", ignoreDuplicates: true },
    )
    .select("id")
    .maybeSingle();

  if (error) {
    // Kastes videre: den der kaldte skal kunne tælle fejl og svare 500, så
    // afsenderen prøver igen frem for at tro beskeden kom frem.
    throw new Error(`Kunne ikke gemme besked: ${error.message}`);
  }

  // Ingen række tilbage betyder at (channel, external_id) fandtes i forvejen.
  if (!data) return { id: null, leadId, duplicate: true, skipped: false };

  return { id: data.id as string, leadId, duplicate: false, skipped: false };
}

/**
 * Skærer citeret historik af en mail.
 *
 * Uden det her består hver eneste besked i tråden af hele samtalen igen, og
 * korrespondancen bliver ulæselig efter tredje svar. Klipper ved de mønstre
 * danske og engelske mailklienter bruger til at indlede et citat.
 */
export function stripQuotedText(body: string): string {
  const markers = [
    /^>.*$/m,
    /^-{2,}\s*Oprindelig (besked|mail)\s*-{2,}/im,
    /^-{2,}\s*Original Message\s*-{2,}/im,
    /^(Den|På) .{3,60} skrev .{1,120}:\s*$/im,
    /^On .{3,60} wrote:\s*$/im,
    /^Fra:\s.+$/im,
    /^From:\s.+$/im,
  ];

  let cut = body.length;
  for (const marker of markers) {
    const match = body.match(marker);
    if (match?.index !== undefined && match.index < cut) cut = match.index;
  }

  const trimmed = body.slice(0, cut).trim();
  // Består mailen udelukkende af citat, er det bedre at vise citatet end
  // ingenting — så ved man i det mindste at der kom noget.
  return trimmed || body.trim();
}
