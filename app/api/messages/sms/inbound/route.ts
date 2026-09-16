import { NextResponse, type NextRequest } from "next/server";
import { authorized } from "@/lib/api-auth";
import { findLead, serviceClient, storeMessage } from "@/lib/messages";
import { formatPhone } from "@/lib/phone";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Tager imod SMS'er kunderne sender til firmanummeret.
 *
 * GatewayAPI kalder her hver gang der kommer en besked ind på nummeret.
 * Webhooken kan ikke sætte egne headers, så hemmeligheden ligger i URL'en:
 *
 *   POST https://<domæne>/api/messages/sms/inbound?token=<SMS_WEBHOOK_SECRET>
 *
 * Ruten er undtaget i proxy.ts — GatewayAPI har ingen brugersession.
 */

export const runtime = "nodejs";

interface GatewayApiPayload {
  /** GatewayAPI's id for beskeden. */
  id?: number | string;
  /** Kundens nummer. */
  msisdn?: number | string;
  /** Vores nummer. */
  receiver?: number | string;
  message?: string;
  /** Unix-tid i sekunder. */
  senttime?: number | string;
}

/**
 * GatewayAPI sender JSON, men en webhook kan være sat op med
 * form-kodning — og en fejlkonfiguration skal ikke tabe kundens besked.
 */
async function readPayload(request: NextRequest): Promise<GatewayApiPayload | null> {
  const type = request.headers.get("content-type") ?? "";

  try {
    if (type.includes("application/json")) {
      return (await request.json()) as GatewayApiPayload;
    }
    const form = await request.formData();
    return Object.fromEntries(
      [...form.entries()].map(([key, value]) => [key, String(value)]),
    ) as GatewayApiPayload;
  } catch {
    return null;
  }
}

/**
 * Opretter et lead ud fra en SMS fra et ukendt nummer.
 *
 * Alternativet var en "uafklaret"-indbakke, men den ville være endnu et sted
 * at huske at kigge — og en SMS til firmanummeret er næsten altid en kunde.
 * Som lead i "Nye" dukker den op hvor Meick kigger i forvejen.
 *
 * Navnet er nummeret indtil han retter det. leads.name må ikke være tomt, og
 * et nummer er mere brugbart end "Ukendt".
 */
async function createLeadFromSms(
  supabase: SupabaseClient,
  msisdn: string,
  message: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("leads")
    .insert({
      name: formatPhone(msisdn),
      phone: msisdn,
      description: message.slice(0, 5000) || null,
      platform: "SMS",
      campaign_name: "SMS til firmanummeret",
      status: "Nye",
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("Kunne ikke oprette lead ud fra SMS:", error?.message);
    return null;
  }

  await supabase.from("lead_activity").insert({
    lead_id: data.id,
    what: `Oprettet ud fra SMS fra ${formatPhone(msisdn)}`,
    who: "System",
  });

  return data.id as string;
}

export async function POST(request: NextRequest) {
  if (!authorized(request, process.env.SMS_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "Ikke godkendt" }, { status: 401 });
  }

  const payload = await readPayload(request);
  if (!payload) {
    return NextResponse.json({ error: "Ugyldigt indhold" }, { status: 400 });
  }

  const msisdn = payload.msisdn === undefined ? "" : String(payload.msisdn).trim();
  const message = (payload.message ?? "").trim();

  if (!msisdn) {
    return NextResponse.json({ error: "msisdn mangler" }, { status: 400 });
  }

  // senttime er sekunder, ikke millisekunder. Uden gangetegnet ville alle
  // SMS'er blive dateret til januar 1970 og lægge sig nederst i samtalen.
  const sent = Number(payload.senttime);
  const sentAt =
    Number.isFinite(sent) && sent > 0 ? new Date(sent * 1000) : new Date();

  try {
    const supabase = serviceClient();

    // Kendes nummeret ikke, oprettes leadet først. Så er der noget at hægte
    // beskeden på, og storeMessage finder det i opslaget lige efter.
    const known = await findLead(supabase, "sms", msisdn);
    if (!known) {
      const created = await createLeadFromSms(supabase, msisdn, message);
      if (created) {
        console.info(`Nyt lead oprettet ud fra SMS fra ${formatPhone(msisdn)}.`);
      }
    }

    const stored = await storeMessage(supabase, {
      channel: "sms",
      direction: "ind",
      // Uden id fra GatewayAPI bruges nummer og tidspunkt. Ikke lige så
      // stabilt, men nok til at et genudsendt webhook-kald ikke bliver en
      // dublet.
      externalId: payload.id ? String(payload.id) : `${msisdn}:${sentAt.getTime()}`,
      counterparty: msisdn,
      body: message,
      sentAt,
      // Ingen requireLead: SMS'en kom ind på et nummer der kun findes her.
      // Gemmer vi den ikke, findes den ingen steder.
    });

    // Kunne leadet ikke oprettes, gemmes beskeden alligevel uden lead_id.
    // Hellere en besked der skal hægtes på i hånden end en tabt kunde.
    if (!stored.leadId && !stored.duplicate) {
      console.warn(`SMS fra ${formatPhone(msisdn)} kunne ikke knyttes til et lead.`);
    }

    return NextResponse.json({ ok: true, duplicate: stored.duplicate });
  } catch (error) {
    const besked = error instanceof Error ? error.message : String(error);
    console.error("Kunne ikke gemme indkommende SMS:", besked);
    // 500 frem for 200: GatewayAPI prøver igen, og unique-constrainten sørger
    // for at et genforsøg ikke bliver til to beskeder.
    return NextResponse.json({ error: "Kunne ikke gemme beskeden" }, { status: 500 });
  }
}
