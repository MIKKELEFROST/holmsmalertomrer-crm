import { toMsisdn } from "./phone";

/**
 * Afsendelse af SMS gennem GatewayAPI.
 *
 * Grunden til at SMS'er ikke længere sendes fra Meicks egen telefon er at en
 * SMS fra telefonen ikke findes nogen steder bagefter. Sendes den herfra,
 * ligger den i korrespondancen, og kundens svar kommer retur på det samme
 * nummer og lander samme sted.
 */

const API_BASE = process.env.GATEWAYAPI_BASE_URL ?? "https://gatewayapi.eu";

export interface SendResult {
  /** GatewayAPI's id for beskeden. Bruges som external_id, så en webhook om
   *  den samme besked ikke opretter en dublet. */
  id: string;
  /** Antal takserede beskeder. Over 160 tegn deles en SMS op. */
  dele: number;
}

/**
 * Er GatewayAPI sat op?
 *
 * Er den ikke, falder UI'et tilbage til at åbne telefonens egen SMS-app som
 * før. Det gør at CRM'et kan deployes færdigt, før nummeret er på plads.
 */
export function smsConfigured(): boolean {
  return Boolean(process.env.GATEWAYAPI_TOKEN && process.env.SMS_SENDER);
}

/**
 * Hvor mange SMS'er teksten koster.
 *
 * æ, ø og å er med i GSM-7-alfabetet, så en dansk besked fylder ét tegn pr.
 * tegn. Bruges der et tegn udenfor — typisk et smart citationstegn eller en
 * emoji klippet ind fra et tilbud — skifter hele beskeden til UCS-2, og så
 * falder grænsen fra 160 til 70. Derfor tælles der, frem for at gætte.
 */
export function smsParts(text: string): number {
  // Tegn der kræver escape i GSM-7 fylder to. Resten af de latinske tegn og
  // de danske bogstaver fylder ét.
  const gsm7 =
    /^[@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&'()*+,\-./0-9:;<=>?¡A-ZÄÖÑÜ§¿a-zäöñüà\r\n\f^{}\\[~\]|€]*$/;

  if (!gsm7.test(text)) {
    // UCS-2: 70 tegn, 67 pr. del når beskeden deles.
    return text.length <= 70 ? 1 : Math.ceil(text.length / 67);
  }

  const escapes = (text.match(/[\f^{}\\[~\]|€]/g) ?? []).length;
  const length = text.length + escapes;
  return length <= 160 ? 1 : Math.ceil(length / 153);
}

/**
 * Sender en SMS. Kaster hvis den ikke kom af sted.
 *
 * Kaster med vilje frem for at returnere en fejl: en SMS der ikke blev sendt,
 * må under ingen omstændigheder ende med at blive skrevet i korrespondancen
 * som om den blev det.
 */
export async function sendSms(to: string, text: string): Promise<SendResult> {
  const token = process.env.GATEWAYAPI_TOKEN;
  const sender = process.env.SMS_SENDER;

  if (!token || !sender) {
    throw new Error("GATEWAYAPI_TOKEN eller SMS_SENDER mangler.");
  }

  const msisdn = toMsisdn(to);
  if (!msisdn) throw new Error(`"${to}" er ikke et nummer der kan sendes til.`);

  if (!text.trim()) throw new Error("Beskeden er tom.");

  // GatewayAPI bruger Basic auth med token'et som brugernavn og tom adgangskode.
  const auth = Buffer.from(`${token}:`).toString("base64");

  const response = await fetch(`${API_BASE}/rest/mtsms`, {
    method: "POST",
    headers: {
      authorization: `Basic ${auth}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sender,
      message: text,
      recipients: [{ msisdn: Number(msisdn) }],
    }),
  });

  if (!response.ok) {
    // Svaret indeholder grunden — forkert token, ukendt afsender, tomt
    // kreditkort. Den skal med op, ellers står der bare "kunne ikke sende".
    const detail = await response.text().catch(() => "");
    throw new Error(
      `GatewayAPI svarede ${response.status}: ${detail.slice(0, 300) || "intet svar"}`,
    );
  }

  const body = (await response.json()) as { ids?: (number | string)[] };
  const id = body.ids?.[0];
  if (id === undefined) throw new Error("GatewayAPI returnerede ingen besked-id.");

  return { id: String(id), dele: smsParts(text) };
}
