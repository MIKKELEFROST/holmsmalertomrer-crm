/**
 * Formatering — dansk, og bevidst deterministisk.
 *
 * Alle funktioner der afhænger af "nu" tager det som argument i stedet for at
 * kalde Date.now() selv. Serveren og klienten skal nå frem til samme streng
 * ved første render, ellers får vi hydration-fejl. Kalendertidszonen er altid
 * Europe/Copenhagen, uanset hvor koden kører — Vercel kører i UTC, og uden
 * det ville et lead skifte dag ved midnat dansk tid.
 */

export const TZ = "Europe/Copenhagen";

const MONTHS_SHORT = [
  "jan",
  "feb",
  "mar",
  "apr",
  "maj",
  "jun",
  "jul",
  "aug",
  "sep",
  "okt",
  "nov",
  "dec",
];

const WEEKDAYS = [
  "Søndag",
  "Mandag",
  "Tirsdag",
  "Onsdag",
  "Torsdag",
  "Fredag",
  "Lørdag",
];

/** Kalenderdelene af et tidspunkt, set i dansk tid. */
export interface DateParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0 = søndag
}

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  weekday: "short",
  hour12: false,
});

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function toParts(input: string | Date): DateParts {
  const date = typeof input === "string" ? new Date(input) : input;
  const parts = partsFormatter.formatToParts(date);
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "0";
  // Intl kan give "24" som time ved midnat i nogle runtimes; normalisér.
  const hour = Number(get("hour")) % 24;
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour,
    minute: Number(get("minute")),
    weekday: WEEKDAY_INDEX[get("weekday")] ?? 0,
  };
}

/** Dansk kalenderdato som "YYYY-MM-DD". */
export function toDateKey(input: string | Date): string {
  const p = toParts(input);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/**
 * Dagnummer for en "YYYY-MM-DD"-streng, så to datoer kan trækkes fra hinanden
 * uden at ramme sommertid. Datofelter i databasen er rene datoer uden tid.
 */
export function dayNumber(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** Antal hele dage fra i dag til datoen. Negativt = overskredet. */
export function daysUntil(dateKey: string, now: string | Date): number {
  return dayNumber(dateKey) - dayNumber(toDateKey(now));
}

/* -------------------------------------------------------------------------
   Tal og beløb
------------------------------------------------------------------------- */

/** 72000 → "72.000". Skrevet i hånden, så server og klient altid er enige. */
export function groupDigits(n: number): string {
  const neg = n < 0;
  const digits = Math.abs(Math.round(n)).toString();
  let out = "";
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ".";
    out += digits[i];
  }
  return neg ? `-${out}` : out;
}

/** 72000 → "72.000 kr." */
export function kr(n: number | null | undefined): string {
  return `${groupDigits(n ?? 0)} kr.`;
}

/* -------------------------------------------------------------------------
   Datoer
------------------------------------------------------------------------- */

/** "12. sep" */
export function shortDate(input: string | Date): string {
  const p = toParts(input);
  return `${p.day}. ${MONTHS_SHORT[p.month - 1]}`;
}

/** "12. sep 11:20" */
export function shortDateTime(input: string | Date): string {
  const p = toParts(input);
  return `${p.day}. ${MONTHS_SHORT[p.month - 1]} ${String(p.hour).padStart(2, "0")}:${String(
    p.minute,
  ).padStart(2, "0")}`;
}

/** "10. sep 2026, kl. 15:48" */
export function fullDateTime(input: string | Date): string {
  const p = toParts(input);
  return `${p.day}. ${MONTHS_SHORT[p.month - 1]} ${p.year}, kl. ${String(p.hour).padStart(
    2,
    "0",
  )}:${String(p.minute).padStart(2, "0")}`;
}

/** "Lørdag 12. sep" — datoen i mobil-headeren. */
export function weekdayDate(input: string | Date): string {
  const p = toParts(input);
  return `${WEEKDAYS[p.weekday]} ${p.day}. ${MONTHS_SHORT[p.month - 1]}`;
}

/** "14:59" */
export function clockTime(input: string | Date): string {
  const p = toParts(input);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

/** En "YYYY-MM-DD" vist som "12. sep 2026". Tom streng hvis datoen mangler. */
export function displayDate(dateKey: string | null | undefined): string {
  if (!dateKey) return "";
  const [y, m, d] = dateKey.split("-").map(Number);
  if (!y || !m || !d) return "";
  return `${d}. ${MONTHS_SHORT[m - 1]} ${y}`;
}

/* -------------------------------------------------------------------------
   Relativ tid — "2 t. siden", "I går", "4 dage", "1 uge", "3 uger"
------------------------------------------------------------------------- */

export function relativeTime(input: string | Date, now: string | Date): string {
  const then = typeof input === "string" ? new Date(input) : input;
  const nowDate = typeof now === "string" ? new Date(now) : now;
  const minutes = Math.floor((nowDate.getTime() - then.getTime()) / 60_000);

  if (minutes < 1) return "Lige nu";
  if (minutes < 60) return `${minutes} min. siden`;

  const dayDiff = dayNumber(toDateKey(nowDate)) - dayNumber(toDateKey(then));

  if (dayDiff === 0) {
    const hours = Math.floor(minutes / 60);
    return `${hours} t. siden`;
  }
  if (dayDiff === 1) return "I går";
  if (dayDiff < 7) return `${dayDiff} dage`;

  const weeks = Math.floor(dayDiff / 7);
  if (weeks === 1) return "1 uge";
  if (weeks < 9) return `${weeks} uger`;

  const months = Math.floor(dayDiff / 30);
  return months === 1 ? "1 måned" : `${months} måneder`;
}

/* -------------------------------------------------------------------------
   Opfølgning
------------------------------------------------------------------------- */

export type FollowUpBucket = "overskredet" | "uge" | "senere";

export function followUpBucket(
  dateKey: string,
  now: string | Date,
): FollowUpBucket {
  const diff = daysUntil(dateKey, now);
  if (diff < 0) return "overskredet";
  if (diff <= 7) return "uge";
  return "senere";
}

/** Teksten på opfølgnings-badget: "I dag", "I morgen", "2 dage siden", … */
export function followUpLabel(dateKey: string, now: string | Date): string {
  const diff = daysUntil(dateKey, now);
  if (diff === 0) return "I dag";
  if (diff === 1) return "I morgen";
  if (diff === -1) return "I går";
  if (diff < 0) return `${Math.abs(diff)} dage siden`;
  if (diff < 7) return `Om ${diff} dage`;
  return displayDate(dateKey);
}

/* -------------------------------------------------------------------------
   Tekst
------------------------------------------------------------------------- */

/** Fornavn — bruges i SMS-skabelonerne. */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** Initialer til avataren. Ét bogstav for ét navn, to for flere. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Kort opgavetekst til kortene: første linje, klippet ved ~40 tegn på
 * ordgrænse. Meta-beskrivelser kan være lange og indeholde linjeskift.
 */
export function taskSummary(
  description: string | null | undefined,
  max = 40,
): string {
  if (!description) return "";
  const firstLine = description.split("\n")[0].trim();
  if (firstLine.length <= max) return firstLine;
  const cut = firstLine.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 20 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** Opgaveteksten i småt, til SMS-skabelonerne. */
export function taskInSentence(description: string | null | undefined): string {
  const summary = taskSummary(description, 60).replace(/…$/, "");
  if (!summary) return "din opgave";
  return summary.charAt(0).toLowerCase() + summary.slice(1);
}

/**
 * Sammensætter en undertitel og springer tomme dele over, så der aldrig står
 * dobbelte prikker.
 */
export function joinParts(parts: (string | null | undefined)[]): string {
  return parts.filter((p) => p && p.trim()).join(" · ");
}

/** Adressen som den skal vises: fri tekst hvis sat, ellers postnummer + by. */
export function displayAddress(lead: {
  address: string | null;
  zip: string | null;
  city: string | null;
}): string {
  if (lead.address && lead.address.trim()) return lead.address.trim();
  return joinParts([lead.zip, lead.city]).replace(" · ", " ");
}

/** Udtrækker postnummer fra fritekst-adresse; resten efter tallet bliver by. */
export function parseAddress(address: string): {
  zip: string | null;
  city: string | null;
} {
  const match = address.match(/\b(\d{4})\b/);
  if (!match) return { zip: null, city: null };
  const zip = match[1];
  const after = address.slice((match.index ?? 0) + 4).trim();
  const city = after.replace(/^[,\s-]+/, "").split(/[,\n]/)[0].trim();
  return { zip, city: city || null };
}
