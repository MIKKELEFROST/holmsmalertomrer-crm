/**
 * Import af Meta Lead Ads-eksport.
 *
 * Metas eksportfil er ikke almindelig CSV: den er UTF-16LE med BOM,
 * tab-separeret, og felter med linjeskift indeni er citeret. Kundens egne
 * beskrivelser indeholder ofte linjeskift, så en naiv split på "\n" river
 * rækkerne midt over.
 *
 * Testet mod den rigtige eksport (7. aug – 11. sep 2026, 19 leads).
 */

import { cityForZip } from "./postal-codes";

/** Én række fra eksporten, kolonnenavn → værdi. */
export type MetaRow = Record<string, string>;

/** Et lead klar til at blive skrevet i databasen. */
export interface ParsedLead {
  meta_id: string;
  created_time: string;
  name: string;
  email: string | null;
  phone: string | null;
  zip: string | null;
  city: string | null;
  description: string | null;
  platform: string | null;
  campaign_name: string | null;
  ad_name: string | null;
  form_name: string | null;
  meta_lead_status: string | null;
}

/**
 * Afkoder eksportfilen til tekst. Meta skriver UTF-16LE med BOM, men filer
 * der har været gennem et regneark kan komme tilbage som UTF-8 — begge dele
 * håndteres, så en bruger ikke skal tænke over det.
 */
export function decodeMetaExport(bytes: Uint8Array): string {
  const utf16le = bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe;
  const utf16be = bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff;

  let text: string;
  if (utf16le) {
    text = new TextDecoder("utf-16le").decode(bytes);
  } else if (utf16be) {
    text = new TextDecoder("utf-16be").decode(bytes);
  } else {
    text = new TextDecoder("utf-8").decode(bytes);
  }

  // Fjern BOM og normalisér linjeskift, så CR/LF ikke ender i værdierne.
  return text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/**
 * Parser tab-separeret tekst med citerede felter.
 *
 * Følger samme regler som RFC 4180: et felt kan omsluttes af `"`, og et
 * dobbelt `""` inde i et citeret felt betyder ét bogstaveligt anførselstegn.
 */
export function parseDelimited(text: string, delimiter = "\t"): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  // Sidste felt/række, hvis filen ikke slutter med linjeskift.
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

/** Rækker som opslagsobjekter med kolonnenavnene fra første linje. */
export function toRows(text: string): MetaRow[] {
  const table = parseDelimited(text);
  if (table.length < 2) return [];

  const header = table[0].map((h) => h.trim());
  return table.slice(1).map((cells) => {
    const row: MetaRow = {};
    header.forEach((key, i) => {
      row[key] = (cells[i] ?? "").trim();
    });
    return row;
  });
}

const PLATFORM_NAMES: Record<string, string> = {
  fb: "Facebook",
  ig: "Instagram",
  facebook: "Facebook",
  instagram: "Instagram",
  msg: "Messenger",
  an: "Audience Network",
};

export function platformName(raw: string | undefined): string | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  return PLATFORM_NAMES[key] ?? raw.trim();
}

/** Meta sender telefonnumre som `p:+4523710924`. */
export function cleanPhone(raw: string | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim().replace(/^p:/i, "").trim();
  return value || null;
}

/** Postnummeret kan komme som ren tekst eller pakket ind. Træk 4 cifre ud. */
export function cleanZip(raw: string | undefined): string | null {
  if (!raw) return null;
  const match = raw.match(/\b(\d{4})\b/);
  return match ? match[1] : null;
}

/**
 * Kolonnenavnet for opgavebeskrivelsen er selve spørgsmålet fra
 * lead-formularen, så det ændrer sig hver gang formularen omdøbes. Find den
 * kolonne der ligner et fritekstsvar frem for at hardkode navnet.
 */
const KNOWN_COLUMNS = new Set([
  "id",
  "created_time",
  "ad_id",
  "ad_name",
  "adset_id",
  "adset_name",
  "campaign_id",
  "campaign_name",
  "form_id",
  "form_name",
  "is_organic",
  "platform",
  "postnummer",
  "zip",
  "zip_code",
  "email",
  "full_name",
  "phone_number",
  "lead_status",
]);

export function findDescriptionColumn(row: MetaRow): string | null {
  const candidates = Object.keys(row).filter((key) => !KNOWN_COLUMNS.has(key));
  if (candidates.length === 0) return null;

  // Vælg den kolonne der faktisk indeholder tekst, og den længste hvis flere.
  const withText = candidates
    .filter((key) => (row[key] ?? "").trim().length > 0)
    .sort((a, b) => (row[b] ?? "").length - (row[a] ?? "").length);

  return withText[0] ?? candidates[0];
}

/**
 * Modtagelsestidspunktet. Falder tilbage på nu, hvis feltet mangler eller ikke
 * kan læses — ét lead med en skæv dato må ikke vælte hele importen, og et lead
 * uden tidsstempel skal stadig ringes op.
 */
function parseTimestamp(raw: string | undefined): string {
  const parsed = raw ? new Date(raw) : null;
  if (parsed && !Number.isNaN(parsed.getTime())) return parsed.toISOString();
  return new Date().toISOString();
}

const cleanValue = (value: string | undefined): string | null => {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
};

/** Oversætter én eksportrække til et lead. */
export function rowToLead(row: MetaRow): ParsedLead | null {
  const metaId = cleanValue(row.id);
  const name = cleanValue(row.full_name);

  // Uden Meta-id kan vi ikke afvise dubletter, og uden navn er leadet
  // ubrugeligt. Begge dele skal være der.
  if (!metaId || !name) return null;

  const descriptionColumn = findDescriptionColumn(row);
  const zip = cleanZip(row.postnummer ?? row.zip ?? row.zip_code);

  return {
    meta_id: metaId,
    created_time: parseTimestamp(row.created_time),
    name,
    email: cleanValue(row.email),
    phone: cleanPhone(row.phone_number),
    zip,
    city: cityForZip(zip),
    description: descriptionColumn ? cleanValue(row[descriptionColumn]) : null,
    platform: platformName(row.platform),
    campaign_name: cleanValue(row.campaign_name),
    ad_name: cleanValue(row.ad_name),
    form_name: cleanValue(row.form_name),
    meta_lead_status: cleanValue(row.lead_status),
  };
}

/** Hele eksporten → leads, med dubletter på meta_id fjernet. */
export function parseMetaExport(bytes: Uint8Array): ParsedLead[] {
  const rows = toRows(decodeMetaExport(bytes));
  const seen = new Set<string>();
  const leads: ParsedLead[] = [];

  for (const row of rows) {
    const lead = rowToLead(row);
    if (!lead || seen.has(lead.meta_id)) continue;
    seen.add(lead.meta_id);
    leads.push(lead);
  }

  return leads;
}
