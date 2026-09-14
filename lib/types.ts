/**
 * Domænetyper for lead-CRM'et.
 *
 * Statusrækkefølgen er betydningsbærende: den definerer hvad "et trin frem"
 * og "et trin tilbage" betyder i UI'et. Ret aldrig rækkefølgen uden også at
 * rette design-handoffen.
 */

export const STATUSES = [
  "Nye",
  "Kontaktet",
  "Tilbud sendt",
  "Afventer kunde",
  "Booket",
  "Afsluttet",
  "Tabt",
] as const;

export type LeadStatus = (typeof STATUSES)[number];

/** Kun til prikker og markører — aldrig som tekstfarve. */
export const STATUS_COLORS: Record<LeadStatus, string> = {
  Nye: "#E0A008",
  Kontaktet: "#1E6FA8",
  "Tilbud sendt": "#6B4FA0",
  "Afventer kunde": "#A8760B",
  Booket: "#1F7A5A",
  Afsluttet: "#4C5D6B",
  Tabt: "#A8332A",
};

/** Statusser der tæller med i den åbne pipeline. */
export const OPEN_STATUSES: LeadStatus[] = [
  "Nye",
  "Kontaktet",
  "Tilbud sendt",
  "Afventer kunde",
  "Booket",
];

export const TASK_TAGS = [
  "Tag",
  "Vinduer",
  "Døre",
  "Gulv",
  "Terrasse",
  "Køkken",
  "Tilbygning",
  "Facade",
] as const;

export type TaskTag = (typeof TASK_TAGS)[number];

export const DURATION_UNITS = ["timer", "dage", "uger"] as const;
export type DurationUnit = (typeof DURATION_UNITS)[number];

/** Kilder for manuelt oprettede leads. */
export const MANUAL_SOURCES = [
  "Telefon",
  "Hjemmeside",
  "Anbefaling",
  "Andet",
] as const;
export type ManualSource = (typeof MANUAL_SOURCES)[number];

export interface LeadNote {
  id: string;
  lead_id: string;
  text: string;
  author: string;
  created_at: string;
}

export interface LeadActivity {
  id: string;
  lead_id: string;
  what: string;
  who: string;
  created_at: string;
}

export interface LeadPhoto {
  id: string;
  lead_id: string;
  path: string;
  original_name: string | null;
  created_at: string;
  /** Signeret URL, sat på serveren ved indlæsning. */
  url?: string;
}

export interface Lead {
  id: string;

  /* Fra Meta — må ikke kunne redigeres væk */
  meta_id: string | null;
  created_time: string;
  platform: string | null;
  campaign_name: string | null;
  ad_name: string | null;
  form_name: string | null;
  meta_lead_status: string | null;

  /* Kontakt — kommer fra Meta, men skal kunne rettes */
  name: string;
  email: string | null;
  phone: string | null;
  zip: string | null;
  city: string | null;
  description: string | null;

  /* Meick udfylder selv */
  status: LeadStatus;
  address: string | null;
  tags: string[];
  value: number | null;
  price: number | null;
  start_date: string | null;
  duration_value: number | null;
  duration_unit: DurationUnit | null;
  follow_up: string | null;

  updated_at: string;

  /* Relationer, hentes med */
  notes?: LeadNote[];
  activity?: LeadActivity[];
  photos?: LeadPhoto[];
}

/** Felter Meick kan redigere direkte i UI'et. */
export type EditableLeadFields = Pick<
  Lead,
  | "name"
  | "email"
  | "phone"
  | "address"
  | "description"
  | "tags"
  | "value"
  | "price"
  | "start_date"
  | "duration_value"
  | "duration_unit"
  | "follow_up"
  | "status"
>;

export interface SmsTemplate {
  label: string;
  text: string;
}

/**
 * SMS-skabeloner. `{navn}` erstattes med fornavn, `{opgave}` med
 * opgaveteksten i småt.
 */
export const SMS_TEMPLATES: SmsTemplate[] = [
  {
    label: "Kvitter modtagelse",
    text: "Hej {navn}. Tak for din henvendelse om {opgave}. Jeg ringer til dig inden i morgen kl. 12. Mvh Meick, Holms Maler & Tømrer ApS.",
  },
  {
    label: "Foreslå besigtigelse",
    text: "Hej {navn}. Jeg kigger gerne forbi og ser på opgaven. Passer det dig torsdag mellem 8 og 10? Mvh Meick.",
  },
  {
    label: "Bed om billeder",
    text: "Hej {navn}. Kan du sende 2-3 billeder af opgaven på denne besked? Så kan jeg give dig et mere præcist bud. Mvh Meick.",
  },
  {
    label: "Følg op på tilbud",
    text: "Hej {navn}. Jeg følger op på tilbuddet jeg sendte. Er der noget jeg skal uddybe? Mvh Meick.",
  },
];
