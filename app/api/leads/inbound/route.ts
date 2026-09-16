import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { cityForZip } from "@/lib/postal-codes";
import { cleanPhone, cleanZip, platformName } from "@/lib/meta-import";
import { parseAddress } from "@/lib/format";
import { supabaseUrl } from "@/lib/env";
import { secretMatches } from "@/lib/api-auth";

/**
 * Modtager leads udefra: hjemmesidens kontaktformular og et relay af Meta
 * Lead Ads (Zapier, Make eller en lille funktion der lytter på Metas webhook).
 *
 * Godkendelse sker med en delt hemmelighed i Authorization-headeren, ikke med
 * en brugersession — hjemmesideformularen har ingen bruger at logge ind som.
 * Ruten er derfor undtaget i proxy.ts.
 *
 * Kald:
 *   POST /api/leads/inbound
 *   Authorization: Bearer <LEAD_INTAKE_SECRET>
 *   { "name": "...", "phone": "...", "email": "...", "zip": "2600",
 *     "description": "...", "source": "Hjemmeside", "meta_id": "l:123" }
 *
 * meta_id er valgfrit, men sendes det, afvises dubletter på det.
 */

export const runtime = "nodejs";

interface InboundPayload {
  name?: string;
  full_name?: string;
  phone?: string;
  phone_number?: string;
  email?: string;
  zip?: string;
  postnummer?: string;
  address?: string;
  description?: string;
  message?: string;
  source?: string;
  platform?: string;
  meta_id?: string;
  id?: string;
  created_time?: string;
  campaign_name?: string;
  ad_name?: string;
  form_name?: string;
}

function unauthorized() {
  return NextResponse.json({ error: "Ikke godkendt" }, { status: 401 });
}

export async function POST(request: NextRequest) {
  const expected = process.env.LEAD_INTAKE_SECRET;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!expected || !serviceKey) {
    // Hellere fejle højlydt end at tage imod leads der aldrig bliver gemt.
    console.error("LEAD_INTAKE_SECRET eller SUPABASE_SERVICE_ROLE_KEY mangler");
    return NextResponse.json({ error: "Endpointet er ikke sat op" }, { status: 503 });
  }

  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token || !secretMatches(token, expected)) return unauthorized();

  let payload: InboundPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Ugyldig JSON" }, { status: 400 });
  }

  const name = (payload.name ?? payload.full_name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "Navn mangler" }, { status: 400 });
  }

  const address = payload.address?.trim() || null;
  const zipFromAddress = address ? parseAddress(address).zip : null;
  const zip = cleanZip(payload.zip ?? payload.postnummer) ?? zipFromAddress;

  const source =
    platformName(payload.platform) ?? payload.source?.trim() ?? "Hjemmeside";

  // Service role omgår RLS. Det er nødvendigt her, fordi kaldet kommer fra
  // et system uden brugersession, og nøglen forlader aldrig serveren.
  const supabase = createClient(supabaseUrl(), serviceKey, {
    auth: { persistSession: false },
  });

  const metaId = payload.meta_id ?? payload.id ?? null;

  const { data, error } = await supabase
    .from("leads")
    .upsert(
      {
        meta_id: metaId,
        created_time: payload.created_time
          ? new Date(payload.created_time).toISOString()
          : new Date().toISOString(),
        name: name.slice(0, 200),
        email: payload.email?.trim() || null,
        phone: cleanPhone(payload.phone ?? payload.phone_number),
        zip,
        city: cityForZip(zip),
        address,
        description:
          (payload.description ?? payload.message)?.trim().slice(0, 5000) || null,
        platform: source,
        campaign_name: payload.campaign_name?.trim() || "Modtaget automatisk",
        ad_name: payload.ad_name?.trim() || null,
        form_name: payload.form_name?.trim() || null,
        status: "Nye",
      },
      // Kommer det samme Meta-lead to gange, skal det ikke oprettes igen.
      metaId ? { onConflict: "meta_id", ignoreDuplicates: true } : undefined,
    )
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("Kunne ikke gemme indkommende lead:", error.message);
    return NextResponse.json({ error: "Kunne ikke gemme leadet" }, { status: 500 });
  }

  // Ingen række tilbage betyder at meta_id fandtes i forvejen.
  if (!data) {
    return NextResponse.json({ ok: true, duplicate: true }, { status: 200 });
  }

  await supabase.from("lead_activity").insert({
    lead_id: data.id,
    what: `Lead modtaget fra ${source}`,
    who: "System",
  });

  return NextResponse.json({ ok: true, id: data.id }, { status: 201 });
}

/**
 * Metas webhook verificerer endpointet med et GET-kald før den begynder at
 * sende. Den bruger sin egen verify token, ikke Bearer-hemmeligheden.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const verifyToken = process.env.META_VERIFY_TOKEN;

  if (
    verifyToken &&
    params.get("hub.mode") === "subscribe" &&
    params.get("hub.verify_token") === verifyToken
  ) {
    return new NextResponse(params.get("hub.challenge") ?? "", { status: 200 });
  }

  return unauthorized();
}
