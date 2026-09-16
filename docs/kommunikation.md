# Korrespondance — mails og SMS i CRM'et

> **Status: koden er bygget og bygger grønt. Der mangler adgange.** Postkassens
> IMAP-oplysninger og en GatewayAPI-konto med et lejet nummer. Begge dele
> nedenfor. Indtil de er sat, opfører CRM'et sig præcis som før: `sms:`-links
> åbner telefonens egen app, og der logges ingen mails.

Formålet er at al kommunikation med en kunde står ét sted — på leadet — frem
for spredt mellem Meicks mailprogram og hans telefon.

```
Postkasse (IMAP) ──┐
                   ├─→ messages ─→ Korrespondance på leadet
GatewayAPI (SMS) ──┘
```

## Hvad der sker automatisk

| | Ind | Ud |
|---|---|---|
| **Mail** | Hentes fra INBOX hvert 5. minut | Hentes fra Sendt-mappen |
| **SMS** | Webhook fra GatewayAPI, med det samme | Sendes fra CRM'et, logges straks |

Udgående mail hentes fra Sendt-mappen frem for at blive sendt fra CRM'et. Det
betyder at Meick kan svare fra sin telefon, fra Outlook eller hvor han vil —
mailen bliver logget uanset. Det ville et "send fra CRM'et"-felt ikke kunne.

## To designvalg der er værd at kende

**Mails uden match gemmes ikke.** Kan afsenderen ikke kobles til et lead, går
mailen ikke i CRM'et. Den ligger stadig i postkassen, så intet er tabt — og
CRM'et slipper for at være en kopi af nyhedsbreve og fakturaer. Antallet af
oversprungne mails står i svaret fra synk-endpointet.

**SMS uden match opretter et lead.** Modsat mail har en SMS ikke noget andet
sted at være: nummeret findes kun her. Kommer der en SMS fra et ukendt nummer,
oprettes et lead i "Nye" med nummeret som navn og beskeden som beskrivelse.
Meick retter navnet når han svarer. Er det spam, sletter han leadet.

## 1. Kør migrationen

```
supabase db push
```

Opretter `messages`, `mail_sync_state` og opslagsfunktionerne. `messages` er
med i realtime-publikationen, så en ny besked dukker op uden at siden hentes
forfra.

## 2. Mail (IMAP)

### Miljøvariabler

Sættes i Vercel under Settings → Environment Variables.

| Variabel | Værdi |
|---|---|
| `IMAP_HOST` | Fx `imap.one.com`. Står hos udbyderen under "mailopsætning". |
| `IMAP_PORT` | `993` |
| `IMAP_USER` | Postkassens adresse |
| `IMAP_PASSWORD` | Adgangskoden. Kan udbyderen lave en app-specifik kode, så brug den. |
| `MAIL_OWN_ADDRESSES` | Andre egne adresser, med komma imellem. Afgør hvad der er udgående. |
| `MAIL_SYNC_BACKFILL_DAYS` | `0` = kun ny mail. `30` henter en måned tilbage ved første kørsel. |
| `MAIL_SYNC_SECRET` | `openssl rand -hex 32` |

### Planlagt kørsel

Vercel Cron kan kun køre én gang i døgnet på Hobby-planen, og det er for lidt.
Brug i stedet Supabase, som kan køre hvert minut gratis. Slå `pg_cron` og
`pg_net` til under Database → Extensions, og kør så:

```sql
select cron.schedule(
  'mail-synk',
  '*/5 * * * *',
  $$
    select net.http_post(
      url     := 'https://<domæne>/api/messages/email/sync',
      headers := '{"Authorization": "Bearer <MAIL_SYNC_SECRET>"}'::jsonb
    );
  $$
);
```

Hemmeligheden står i klartekst i `cron.job`. Det er kun synligt for den der har
adgang til databasen i forvejen, men skal det være pænt, kan den lægges i
Supabase Vault og hentes med `vault.decrypted_secrets`.

### Første kørsel

Med `MAIL_SYNC_BACKFILL_DAYS=0` starter synkroniseringen ved den nyeste mail og
henter kun det der kommer derefter. Det er med vilje: uden det ville hele
postkassen — også mail fra før CRM'et fandtes — blive trukket ind 50 ad gangen.

Skal der hentes historik, så sæt variablen til antal dage **før** første
kørsel. Bagefter står der en række i `mail_sync_state`, og så bliver variablen
ikke læst igen for den mappe.

### Afprøvning

```bash
curl -X POST https://<domæne>/api/messages/email/sync \
  -H "Authorization: Bearer <MAIL_SYNC_SECRET>"
```

Svarer med hvad der blev hentet pr. mappe. Blev Sendt-mappen ikke fundet, står
der en advarsel i Vercels log med alle mappenavne på serveren — det sker hos
udbydere der hverken sætter `\Sent`-flaget eller bruger et genkendeligt navn.

## 3. SMS (GatewayAPI)

### Nummeret

Der skal lejes et **to-vejs-nummer** hos GatewayAPI. Meicks eget mobilnummer kan
ikke bruges: en gateway kan kun modtage på numre den selv kontrollerer, så en
SMS til hans SIM-kort når aldrig frem til CRM'et.

Et alfanumerisk afsender-id som `Holms` kan der teknisk set ikke svares på —
det er en begrænsning i selve SMS-protokollen. Sætter man `SMS_SENDER` til et
navn frem for et nummer, virker udgående fint, men indgående forsvinder. Derfor
nummeret.

### Miljøvariabler

| Variabel | Værdi |
|---|---|
| `GATEWAYAPI_TOKEN` | API-nøglen fra GatewayAPI |
| `SMS_SENDER` | Det lejede nummer med landekode, uden plus: `4512345678` |
| `SMS_WEBHOOK_SECRET` | `openssl rand -hex 32` |

Mangler de to første, sender CRM'et ikke selv — SMS-arket åbner telefonens egen
app som før.

### Webhook

Sættes op hos GatewayAPI under det lejede nummer. GatewayAPI kan ikke sætte egne
headers, så hemmeligheden ligger i URL'en:

```
https://<domæne>/api/messages/sms/inbound?token=<SMS_WEBHOOK_SECRET>
```

Endpointet svarer 500 hvis beskeden ikke kunne gemmes, så GatewayAPI prøver
igen. Dubletter er der taget højde for: unique på `(channel, external_id)`.

### Afprøvning

```bash
curl -X POST "https://<domæne>/api/messages/sms/inbound?token=<SMS_WEBHOOK_SECRET>" \
  -H "content-type: application/json" \
  -d '{"id":1,"msisdn":4512345678,"message":"Test","senttime":1789000000}'
```

Brug et nummer der står på et rigtigt lead, så matchningen kan ses virke. Med et
ukendt nummer skal der dukke et nyt lead op i "Nye".

## Matchning

Beskeder kobles til leads på mailadresse (små bogstaver, trimmet) og på de
sidste otte cifre af telefonnummeret. De otte cifre gør at `12 34 56 78`,
`+4512345678` og `004512345678` er det samme nummer.

Har den samme kunde flere leads — tag i 2024, terrasse i 2026 — hægtes beskeden
på det nyeste. Det er næsten altid den samtale der er i gang.

`public.phone_key()` i databasen og `phoneKey()` i `lib/phone.ts` skal give
samme svar. Ændres den ene, skal den anden med, ellers holder indekset op med
at matche det koden leder efter.

## Persondata

Korrespondancen indeholder kundernes egne beskeder. To ting følger af det:

- Nævn i privatlivspolitikken at kommunikation gemmes, og hvor længe.
- `messages` slettes sammen med leadet (`on delete cascade`). Sletter Meick et
  lead, ryger korrespondancen med.

Servicebeskeder til en kunde der selv har henvendt sig, er uproblematiske.
Markedsføring pr. SMS kræver samtykke efter markedsføringslovens § 10 — det
gælder også en "husk os til foråret" til gamle leads.
