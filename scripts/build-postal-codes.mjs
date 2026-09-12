/**
 * Genererer lib/postal-codes.ts ud fra Dataforsyningens åbne postnummer-API.
 *
 * Kør: npm run build:postnumre
 *
 * Listen ændrer sig sjældent (nye postnumre oprettes et par gange om året),
 * så den er tjekket ind frem for at blive hentet ved runtime.
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const API = "https://api.dataforsyningen.dk/postnumre";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "lib", "postal-codes.ts");

const response = await fetch(API);
if (!response.ok) {
  throw new Error(`Kunne ikke hente postnumre: HTTP ${response.status}`);
}

const entries = (await response.json())
  .map((item) => [item.nr, item.navn])
  .sort((a, b) => a[0].localeCompare(b[0]));

if (entries.length < 500) {
  throw new Error(`Mistænkeligt få postnumre (${entries.length}) — afbryder`);
}

const lines = entries
  .map(([nr, navn]) => `  "${nr}": ${JSON.stringify(navn)},`)
  .join("\n");

writeFileSync(
  OUT,
  `/**
 * Danske postnumre → bynavn.
 *
 * Meta Lead Ads sender kun postnummeret, aldrig byen, så den slås op her.
 * Genereret fra Dataforsyningens åbne postnummer-API
 * (${API}), ${entries.length} postnumre.
 * Regenerér med: npm run build:postnumre
 */

export const POSTAL_CODES: Record<string, string> = {
${lines}
};

/** Bynavn for et postnummer, eller null hvis det ikke findes. */
export function cityForZip(zip: string | null | undefined): string | null {
  if (!zip) return null;
  return POSTAL_CODES[zip.trim()] ?? null;
}
`,
);

console.log(`Skrev ${OUT} — ${entries.length} postnumre`);
