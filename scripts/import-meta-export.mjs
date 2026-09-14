/**
 * Importerer en Meta Lead Ads-eksport ind i databasen.
 *
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-meta-export.mjs <fil.csv>
 *
 * Idempotent: meta_id er unik, så den samme fil kan køres igen uden at lave
 * dubletter. Bruger service role-nøglen, fordi der ikke er nogen brugersession
 * at logge ind som — nøglen må aldrig havne i klienten.
 *
 * Eksporten hentes i Meta Business Suite under Alle værktøjer → Formularer for
 * kundeemner → Download.
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// lib/meta-import.ts er TypeScript; kør parseren gennem Next.js' egen
// transpilering frem for at duplikere den her.
const { parseMetaExport } = await import("../lib/meta-import.ts").catch(() => {
  console.error(
    "Kunne ikke indlæse lib/meta-import.ts.\n" +
      "Kør scriptet med tsx:  npx tsx scripts/import-meta-export.mjs <fil.csv>",
  );
  process.exit(1);
});

const [, , filePath] = process.argv;
if (!filePath) {
  console.error("Brug: node scripts/import-meta-export.mjs <fil.csv>");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "NEXT_PUBLIC_SUPABASE_URL og SUPABASE_SERVICE_ROLE_KEY skal være sat.\n" +
      "Service role-nøglen findes i Supabase under Project Settings → API.",
  );
  process.exit(1);
}

const leads = parseMetaExport(new Uint8Array(readFileSync(filePath)));
console.log(`Parset ${leads.length} leads fra ${filePath}`);

if (leads.length === 0) {
  console.error("Ingen leads fundet — er det den rigtige fil?");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false },
});

const { data, error } = await supabase
  .from("leads")
  .upsert(leads, { onConflict: "meta_id", ignoreDuplicates: true })
  .select("id, meta_id, name");

if (error) {
  console.error("Import fejlede:", error.message);
  process.exit(1);
}

const inserted = data ?? [];
console.log(
  `Oprettet ${inserted.length} nye leads (${leads.length - inserted.length} fandtes i forvejen)`,
);

// Hvert nyt lead får en historikpost, så der står hvor det kom fra.
if (inserted.length > 0) {
  const byMetaId = new Map(leads.map((l) => [l.meta_id, l]));
  const { error: logError } = await supabase.from("lead_activity").insert(
    inserted.map((row) => {
      const lead = byMetaId.get(row.meta_id);
      const form = lead?.form_name ? ` — formular "${lead.form_name}"` : "";
      return {
        lead_id: row.id,
        what: `Lead modtaget fra ${lead?.platform ?? "Meta"}${form}`,
        who: "Meta",
        created_at: lead?.created_time,
      };
    }),
  );

  if (logError) console.error("Kunne ikke skrive historik:", logError.message);
}

console.log("Færdig.");
