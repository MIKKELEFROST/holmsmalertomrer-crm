import { createTransport } from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer";
import { ImapFlow } from "imapflow";
import { mailConfig } from "./imap";

/**
 * Afsendelse af mail fra CRM'et.
 *
 * Den sendes gennem Holms egen postkasse hos Simply, ikke gennem en
 * tredjepart. Så kommer den fra tomrer@holmsmaler.dk, kundens svar lander i
 * den rigtige indbakke, og der er ingen ny afsender at skulle godkende i SPF
 * og DKIM.
 *
 * Tre ting skal ske, og de kan fejle hver for sig:
 *   1. Mailen skal ud til kunden          (SMTP — fejler den, er intet sket)
 *   2. En kopi skal i Sendt-mappen        (IMAP APPEND — pænt, ikke kritisk)
 *   3. Den skal stå i korrespondancen     (databasen — kalderens ansvar)
 */

export interface SendMailResult {
  /** Message-ID. Gemmes som external_id, så IMAP-synkroniseringen kender den
   *  igen når den henter kopien fra Sendt-mappen og ikke laver en dublet. */
  messageId: string;
  /** Kom kopien i Sendt-mappen? Falsk betyder at mailen ER sendt, men ikke
   *  kan ses i Meicks eget mailprogram før synkroniseringen har kørt. */
  gemtISendt: boolean;
}

export function smtpConfigured(): boolean {
  return Boolean(
    // SMTP_HOST har ingen fallback med vilje — se smtpConfig().
    process.env.SMTP_HOST &&
      (process.env.SMTP_USER || process.env.IMAP_USER) &&
      (process.env.SMTP_PASSWORD || process.env.IMAP_PASSWORD),
  );
}

interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  fromName: string;
}

function smtpConfig(): SmtpConfig {
  // Brugernavn og adgangskode falder tilbage på IMAP-oplysningerne: det er
  // den samme postkasse, og at kræve dem skrevet to gange ville kun være en
  // ekstra måde at stave forkert på.
  //
  // Værtsnavnet gør IKKE. Hos Simply er IMAP mail.simply.com og SMTP
  // smtp.simply.com, og det mønster går igen hos de fleste udbydere. En
  // fallback ville have sendt til den forkerte server og fejlet med en
  // forbindelsesfejl, der intet siger om hvad der er galt.
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER || process.env.IMAP_USER;
  const pass = process.env.SMTP_PASSWORD || process.env.IMAP_PASSWORD;

  if (!host || !user || !pass) {
    throw new Error(
      "SMTP er ikke sat op. SMTP_HOST skal sættes — hos Simply er det " +
        "smtp.simply.com, ikke det samme som IMAP_HOST. SMTP_USER og " +
        "SMTP_PASSWORD kan udelades, hvis IMAP_USER og IMAP_PASSWORD peger " +
        "på samme postkasse.",
    );
  }

  return {
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    user,
    pass,
    fromName: process.env.MAIL_FROM_NAME || "Holms Maler & Tømrer",
  };
}

/**
 * Laver et Message-ID.
 *
 * Vi laver det selv frem for at lade serveren gøre det, fordi vi skal kende
 * det på forhånd: det er nøglen der binder den sendte mail, kopien i
 * Sendt-mappen og rækken i korrespondancen sammen. Uden det ville
 * synkroniseringen hente vores egen mail hjem igen som en ny besked.
 */
function newMessageId(from: string): string {
  const domain = from.split("@")[1] ?? "localhost";
  const random = `${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 12)}`;
  return `<${random}@${domain}>`;
}

/**
 * Lægger en kopi i Sendt-mappen.
 *
 * SMTP sender kun; den rører ikke postkassen. Uden det her ville mailen være
 * usynlig i Meicks eget mailprogram, og en tråd han fortsatte derfra ville
 * mangle sin begyndelse.
 *
 * Fejler den, er det ikke kritisk: næste synkronisering finder ingenting, men
 * mailen er sendt, og korrespondancen i CRM'et har den. Derfor kastes der
 * ikke — der returneres false.
 */
async function appendToSent(raw: Buffer): Promise<boolean> {
  const config = mailConfig();

  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.port === 993,
    auth: { user: config.user, pass: config.pass },
    logger: false,
  });

  try {
    await client.connect();
    const folders = await client.list();
    const sent =
      folders.find((f) => f.specialUse === "\\Sent")?.path ??
      folders.find((f) =>
        ["sent", "sent items", "sendt", "sendte elementer"].includes(
          f.name.trim().toLowerCase(),
        ),
      )?.path;

    if (!sent) return false;

    // \Seen: vi har jo selv skrevet den, den skal ikke stå som ulæst.
    await client.append(sent, raw, ["\\Seen"]);
    return true;
  } catch (error) {
    console.warn(
      "Mailen blev sendt, men kopien kunne ikke lægges i Sendt:",
      error instanceof Error ? error.message : String(error),
    );
    return false;
  } finally {
    await client.logout().catch(() => client.close());
  }
}

/**
 * Sender en mail. Kaster hvis den ikke kom af sted.
 *
 * Kaster med vilje: en mail der ikke blev sendt, må aldrig ende i
 * korrespondancen som om den blev det.
 */
export async function sendMail(
  to: string,
  subject: string,
  text: string,
): Promise<SendMailResult> {
  const config = smtpConfig();

  if (!to.includes("@")) throw new Error(`"${to}" er ikke en mailadresse.`);
  if (!text.trim()) throw new Error("Mailen er tom.");

  const messageId = newMessageId(config.user);

  // Beskeden bygges én gang og bruges to steder — afsendelsen og kopien i
  // Sendt. Så er de to garanteret ens, helt ned til Message-ID.
  const raw = await new MailComposer({
    from: { name: config.fromName, address: config.user },
    to,
    subject: subject.trim() || "(uden emne)",
    text,
    messageId,
    date: new Date(),
  })
    .compile()
    .build();

  const transporter = createTransport({
    host: config.host,
    port: config.port,
    // 465 er implicit TLS. 587 starter i klartekst og opgraderer med
    // STARTTLS, hvilket nodemailer gør af sig selv.
    secure: config.port === 465,
    auth: { user: config.user, pass: config.pass },
  });

  try {
    await transporter.sendMail({
      envelope: { from: config.user, to },
      raw,
    });
  } catch (error) {
    const besked = error instanceof Error ? error.message : String(error);
    throw new Error(`Mailen kunne ikke sendes: ${besked}`);
  } finally {
    transporter.close();
  }

  const gemtISendt = await appendToSent(raw);

  return { messageId, gemtISendt };
}
