/**
 * Telefonnumre — normalisering til matchning og til afsendelse.
 *
 * Det samme nummer skrives på et halvt dusin måder: "12 34 56 78" i et
 * Meta-lead, "+45 12345678" når kunden selv taster det, "004512345678" fra
 * et gammelt system. Sammenlignes de råt, matcher en indkommende SMS ikke
 * leadet, og beskeden lander i uafklaret uden nogen grund.
 */

/** Alt andet end cifre ryger. Beholder ikke +, det bærer ingen information her. */
function digits(raw: string): string {
  return raw.replace(/\D/g, "");
}

/**
 * Nøglen to numre sammenlignes på: de sidste otte cifre.
 *
 * Danske numre er otte cifre, så landekode (45), udlandsprefiks (0045) og
 * plus falder af sig selv uden at skulle genkendes hver for sig.
 *
 * Skal spejle `public.phone_key()` i databasen præcist — ændres den ene, skal
 * den anden med, ellers matcher indekset ikke det koden leder efter.
 */
export function phoneKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = digits(raw);
  return value.length < 8 ? null : value.slice(-8);
}

/**
 * Nummeret som GatewayAPI vil have det: landekode + nummer, kun cifre.
 *
 * Mangler landekoden, sættes 45 på. Det er et bevidst dansk default — Holms
 * kunder er danske husejere. Står der allerede en landekode, røres den ikke,
 * så et tysk sommerhusnummer stadig kan nås.
 */
export function toMsisdn(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let value = digits(raw);

  // 00 foran er udlandsprefiks, ikke en del af nummeret.
  if (value.startsWith("00")) value = value.slice(2);

  // Otte cifre er et dansk nummer uden landekode.
  if (value.length === 8) value = `45${value}`;

  // Kortere end et dansk nummer med landekode er ikke et nummer vi kan sende
  // til. Hellere afvise end at sende til nogen tilfældig.
  return value.length >= 10 ? value : null;
}

/** "4512345678" → "+45 12 34 56 78". Kun til visning. */
export function formatPhone(raw: string | null | undefined): string {
  if (!raw) return "";
  const value = digits(raw);
  const local = value.length > 8 ? value.slice(-8) : value;
  if (local.length !== 8) return raw.trim();

  const prefix = value.length > 8 ? `+${value.slice(0, -8)} ` : "";
  return prefix + local.replace(/(\d{2})(?=\d)/g, "$1 ");
}
