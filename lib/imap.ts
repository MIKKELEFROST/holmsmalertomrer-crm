import { ImapFlow, type ListResponse } from "imapflow";
import { simpleParser } from "mailparser";
import type { SupabaseClient } from "@supabase/supabase-js";
import { storeMessage, stripQuotedText } from "./messages";

/**
 * Henter nye mails fra postkassen og lægger dem på leadet.
 *
 * Postkassen ligger på eget domæne uden push-API, så der spørges i stedet med
 * jævne mellemrum. Det koster op til et par minutters forsinkelse; til gengæld
 * kræver det ingen ændringer i DNS eller i måden Meick skriver mails på. Han
 * kan blive ved med at svare fra telefonen som altid — den sendte mail ligger
 * i Sendt-mappen, og så er den med.
 */

/** Højst 50 mails pr. kørsel. Resten kommer med næste; last_uid husker hvor vi
 *  slap. Loftet er der for at en kørsel ikke rammer Vercels tidsgrænse midt i
 *  en indbakke med tusind ulæste. */
const MAX_PER_RUN = 50;

/** Mails større end det her hentes ikke. En mail med en 20 MB tegning i bilag
 *  har ikke en brødtekst der er 20 MB værd at hente ned i en serverless-funktion. */
const MAX_SOURCE_BYTES = 2 * 1024 * 1024;

export interface SyncResult {
  folder: string;
  hentet: number;
  gemt: number;
  udenMatch: number;
  fejl: string | null;
}

export interface SyncReport {
  mapper: SyncResult[];
  /** Den mappe udgående mail blev hentet fra, eller null hvis ingen blev fundet. */
  sendtMappe: string | null;
  /**
   * Alle mappenavne på serveren. Kommer kun med når Sendt-mappen ikke blev
   * fundet — så kan det rigtige navn læses direkte i svaret på det første
   * curl-kald, frem for at skulle graves frem i Vercels log.
   */
  mapperPaaServeren?: string[];
}

interface MailConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  /** Vores egne adresser. En mail fra en af dem er udgående. */
  ownAddresses: Set<string>;
  backfillDays: number;
}

export function mailConfig(): MailConfig {
  const host = process.env.IMAP_HOST;
  const user = process.env.IMAP_USER;
  const pass = process.env.IMAP_PASSWORD;

  if (!host || !user || !pass) {
    throw new Error(
      "IMAP_HOST, IMAP_USER eller IMAP_PASSWORD mangler. Sæt dem i Vercel " +
        "under Settings → Environment Variables.",
    );
  }

  // Egne adresser afgør retningen. Er der flere (info@ og meick@), skrives de
  // med komma imellem. IMAP-brugeren er altid en af dem.
  const extra = (process.env.MAIL_OWN_ADDRESSES ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return {
    host,
    port: Number(process.env.IMAP_PORT ?? 993),
    user,
    pass,
    ownAddresses: new Set([user.toLowerCase(), ...extra]),
    backfillDays: Number(process.env.MAIL_SYNC_BACKFILL_DAYS ?? 0),
  };
}

/**
 * Finder Sendt-mappen.
 *
 * Den hedder noget forskelligt hos hver udbyder — "Sent", "Sent Items",
 * "INBOX.Sent", "Sendt post". IMAP har et flag til formålet, \Sent, som de
 * fleste moderne servere sætter; navnelisten er reserven for dem der ikke gør.
 */
function findSentFolder(folders: ListResponse[]): string | null {
  const flagged = folders.find((folder) => folder.specialUse === "\\Sent");
  if (flagged) return flagged.path;

  // Simply.com er en almindelig IMAP-server uden eget navnevalg, så mappen
  // hedder det Meicks mailprogram døbte den. Dansk Outlook siger "Sendte
  // elementer", Apple Mail og Thunderbird siger "Sendt".
  const names = [
    "sent",
    "sent items",
    "sent mail",
    "sendt",
    "sendt post",
    "sendte elementer",
    "sendte mails",
  ];
  const byName = folders.find((folder) =>
    names.includes(folder.name.trim().toLowerCase()),
  );
  return byName?.path ?? null;
}

/**
 * Synkroniserer én mappe.
 *
 * Retningen bestemmes af afsenderen, ikke af hvilken mappe mailen lå i. En
 * kopi af en sendt mail kan ligge i indbakken, og en videresendt tråd kan ligge
 * i Sendt — afsenderadressen er den eneste der altid siger sandheden.
 */
async function syncFolder(
  client: ImapFlow,
  supabase: SupabaseClient,
  folder: string,
  config: MailConfig,
): Promise<SyncResult> {
  const result: SyncResult = {
    folder,
    hentet: 0,
    gemt: 0,
    udenMatch: 0,
    fejl: null,
  };

  const { data: state } = await supabase
    .from("mail_sync_state")
    .select("uid_validity, last_uid")
    .eq("folder", folder)
    .maybeSingle();

  const lock = await client.getMailboxLock(folder);
  try {
    const mailbox = client.mailbox;
    if (typeof mailbox === "boolean") throw new Error("Mappen kunne ikke åbnes");

    const uidValidity = Number(mailbox.uidValidity);
    const uidNext = Number(mailbox.uidNext);

    // UIDVALIDITY skifter når serveren nummererer mappen forfra. De gemte
    // UID'er betyder så noget andet end de gjorde, og skal kasseres.
    const reset = state != null && Number(state.uid_validity) !== uidValidity;
    let lastUid = reset ? 0 : Number(state?.last_uid ?? 0);

    // Første kørsel. Uden det her ville hele postkassen — også mail fra før
    // CRM'et fandtes — blive hentet ind, 50 ad gangen.
    if (!state || reset) {
      if (config.backfillDays > 0) {
        const since = new Date(Date.now() - config.backfillDays * 86_400_000);
        // search() svarer false hvis serveren afviser søgningen. Så er der
        // ikke noget at bakke tilbage til, og vi starter fra nu.
        const uids = await client.search({ since }, { uid: true });
        lastUid =
          uids && uids.length > 0 ? Math.min(...uids) - 1 : Math.max(uidNext - 1, 0);
      } else {
        lastUid = Math.max(uidNext - 1, 0);
      }
    }

    // "lastUid+1:*" giver altid mindst én besked tilbage, også når der ikke er
    // nogen nye — sådan virker * i IMAP. Derfor filtreres på uid bagefter.
    const messages = client.fetch(
      `${lastUid + 1}:*`,
      { uid: true, source: true, size: true },
      { uid: true },
    );

    let highestUid = lastUid;

    for await (const message of messages) {
      const uid = Number(message.uid);
      if (uid <= lastUid) continue;
      if (result.hentet >= MAX_PER_RUN) break;

      result.hentet += 1;
      highestUid = Math.max(highestUid, uid);

      if (Number(message.size ?? 0) > MAX_SOURCE_BYTES) continue;
      if (!message.source) continue;

      const parsed = await simpleParser(message.source);

      const fromRaw = parsed.from?.value?.[0]?.address ?? null;
      const from = fromRaw ? fromRaw.toLowerCase() : null;
      if (!from) continue;

      const outgoing = config.ownAddresses.has(from);

      // Modparten er den anden i samtalen. På en udgående mail er det
      // modtageren, på en indgående afsenderen.
      // Cc tælles med: sætter Meick kunden i kopi frem for som modtager, er
      // det stadig en mail til kunden.
      const toField = Array.isArray(parsed.to) ? parsed.to : parsed.to ? [parsed.to] : [];
      const ccField = Array.isArray(parsed.cc) ? parsed.cc : parsed.cc ? [parsed.cc] : [];
      const recipients = [...toField, ...ccField]
        .flatMap((entry) => entry.value ?? [])
        .map((entry) => entry.address)
        .filter((address): address is string => Boolean(address))
        .map((address) => address.toLowerCase());

      const counterparty = outgoing
        ? recipients.find((address) => !config.ownAddresses.has(address))
        : from;

      // Mail til sig selv, eller uden modtager vi kan bruge. Ikke korrespondance.
      if (!counterparty || config.ownAddresses.has(counterparty)) continue;

      const externalId =
        parsed.messageId?.trim() ||
        // Uden Message-ID kan dubletter ikke kendes. Mappe + UID er ikke lige
        // så stabilt, men det er bedre end at gemme den samme mail hver gang.
        `${folder}:${uidValidity}:${uid}`;

      const body = parsed.text
        ? stripQuotedText(parsed.text)
        : // text/html-only mails: tags ud, så der står noget læsbart.
          stripQuotedText((parsed.html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));

      const stored = await storeMessage(supabase, {
        channel: "email",
        direction: outgoing ? "ud" : "ind",
        externalId,
        counterparty,
        subject: parsed.subject ?? null,
        body,
        sentAt: parsed.date ?? new Date(),
        // Mailen ligger stadig i Meicks egen postkasse. Kan den ikke matches
        // til et lead, er der intet tabt ved at lade den blive der — og
        // CRM'et slipper for at være en kopi af hans nyhedsbreve.
        requireLead: true,
      });

      if (stored.skipped) result.udenMatch += 1;
      else if (!stored.duplicate) result.gemt += 1;
    }

    await supabase.from("mail_sync_state").upsert({
      folder,
      uid_validity: uidValidity,
      last_uid: highestUid,
      last_run_at: new Date().toISOString(),
      last_error: null,
    });
  } finally {
    lock.release();
  }

  return result;
}

/**
 * Kører synkroniseringen for indbakke og Sendt.
 *
 * Fejler den ene mappe, fortsætter den anden. Der er ingen grund til at miste
 * indgående mail fordi Sendt-mappen hedder noget uventet.
 */
export async function syncMail(supabase: SupabaseClient): Promise<SyncReport> {
  const config = mailConfig();

  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.port === 993,
    auth: { user: config.user, pass: config.pass },
    // ImapFlow logger hele IMAP-dialogen på info-niveau. I Vercels log er det
    // støj der drukner det der betyder noget.
    logger: false,
  });

  await client.connect();

  try {
    const folders = await client.list();
    const sent = findSentFolder(folders);
    const targets = sent ? ["INBOX", sent] : ["INBOX"];

    const results: SyncResult[] = [];
    for (const folder of targets) {
      try {
        results.push(await syncFolder(client, supabase, folder, config));
      } catch (error) {
        const besked = error instanceof Error ? error.message : String(error);
        console.error(`Synk af ${folder} fejlede:`, besked);
        results.push({ folder, hentet: 0, gemt: 0, udenMatch: 0, fejl: besked });
        await supabase.from("mail_sync_state").upsert({
          folder,
          last_run_at: new Date().toISOString(),
          last_error: besked.slice(0, 500),
        });
      }
    }

    if (!sent) {
      console.warn(
        "Sendt-mappen blev ikke fundet. Udgående mails bliver ikke logget. " +
          `Mapper på serveren: ${folders.map((f) => f.path).join(", ")}`,
      );
    }

    return {
      mapper: results,
      sendtMappe: sent,
      ...(sent ? {} : { mapperPaaServeren: folders.map((f) => f.path) }),
    };
  } finally {
    // logout() frem for close(): serveren får besked, og forbindelsen bliver
    // ikke hængende til den selv timer ud.
    await client.logout().catch(() => client.close());
  }
}
