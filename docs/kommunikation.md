# Korrespondance — mails og SMS i CRM'et

Formålet er at kommunikationen med en kunde står ét sted — på leadet — frem for
spredt mellem Meicks mailprogram og hans telefon.

> **Status: mail kører i produktion siden 16-09-2026.** Postkassen synkroniseres
> hvert 5. minut. SMS er ikke tændt — se fase 2.

**Vi starter med mail alene.** SMS kræver et lejet nummer til en månedlig
udgift, og den beslutning er udskudt. Koden til begge dele er bygget, men
SMS-delen slukker sig selv når den ikke er sat op: SMS-arket åbner telefonens
egen app præcis som CRM'et altid har gjort, og webhooken afviser alt.

```
Fase 1   Postkasse (IMAP) ──→ messages ──→ Korrespondance på leadet
Fase 2   GatewayAPI (SMS) ──┘   (udskudt — ingen kodeændring når den tændes)
```

---

# Fase 1 — Mail

| | Ind | Ud |
|---|---|---|
| **Mail** | INBOX, hentes hvert 5. minut | Sendt-mappen |

Udgående mail hentes fra **Sendt-mappen** frem for at blive sendt fra CRM'et.
Det betyder at Meick kan svare fra telefonen, fra sit mailprogram eller hvor han
vil — mailen bliver logget uanset. Et "send mail"-felt i CRM'et ville kun fange
det han skrev derinde.

## Mails uden match gemmes ikke

Kan afsenderen ikke kobles til et lead, går mailen ikke i CRM'et. Den ligger
stadig i postkassen, så intet er tabt — og CRM'et slipper for at være en kopi af
nyhedsbreve, fakturaer og reklamer. Antallet af oversprungne mails står i svaret
fra synk-endpointet, så det kan ses om matchningen rammer skævt.

## 1. Kør migrationen

```
supabase db push
```

Opretter `messages`, `mail_sync_state` og opslagsfunktionerne. `messages` er med
i realtime-publikationen, så en ny mail dukker op uden at siden hentes forfra.

## 2. Miljøvariabler

Postkassen er `tomrer@holmsmaler.dk` hos **Simply.com**. Sættes i Vercel under
Settings → Environment Variables.

| Variabel | Værdi |
|---|---|
| `IMAP_HOST` | `mail.simply.com` |
| `IMAP_PORT` | `993` |
| `IMAP_USER` | `tomrer@holmsmaler.dk` |
| `IMAP_PASSWORD` | Adgangskoden til postkassen — den der er oprettet i Simply-kontrolpanelet |
| `MAIL_OWN_ADDRESSES` | Andre egne adresser, med komma imellem. Tom hvis der kun er den ene. |
| `MAIL_SYNC_BACKFILL_DAYS` | `0` = kun ny mail. `30` henter en måned tilbage ved første kørsel. |
| `MAIL_SYNC_SECRET` | `openssl rand -hex 32` |

To variabler mere, som ikke handler om mail, men som synkroniseringen falder
over hvis de mangler:

| Variabel | Hvorfor |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Beskeder skrives med service role, fordi kaldet kommer fra et system uden brugersession. Værdien er den nye **secret**-nøgle (`sb_secret_…`) fra Supabase → API Keys, ikke publishable. |
| `LEAD_INTAKE_SECRET` | Bruges ikke af mailsynkroniseringen, men af `/api/leads/inbound`. Mangler den, svarer det endpoint 503, og Make-flowet taber leads tavst. |

> **Begge skal være sat på Production.** De lå oprindeligt kun lokalt, fordi de
> blev oprettet til importscriptet, og det kostede en halv times fejlsøgning
> ved opsætningen: `/api/messages/email/sync` svarede 500 med
> "SUPABASE_SERVICE_ROLE_KEY mangler". Vercel indbager miljøvariabler ved
> deploy, så en ny variabel virker **først efter en redeploy** — det er ikke
> nok at gemme den.

Simply bruger `mail.simply.com` til IMAP. Port 993 er SSL/TLS hele vejen og er
den koden regner med; 143 med STARTTLS virker også, men så skal `IMAP_PORT`
sættes til `143`. Verificeret mod den rigtige postkasse 16-09-2026 på 993.

Brugernavnet er den fulde mailadresse, ikke kun `tomrer`. Simply har ikke
app-specifikke adgangskoder, så det er postkassens egen kode der skal bruges.

> **Den kode er nu også en systemadgang.** Den lever i Vercels miljøvariabler og
> giver læseadgang til al kundekorrespondance. Den hører ikke hjemme i repoet,
> som er offentligt, og bør ikke genbruges til andet. Er den delt i en chat, en
> mail eller en seddel undervejs, så skift den i Simply-kontrolpanelet bagefter
> og opdatér variablen i Vercel.

`MAIL_OWN_ADDRESSES` afgør hvad der er udgående mail. Har Holms kun den ene
adresse, kan variablen stå tom: `IMAP_USER` tælles altid med.

## 3. Planlagt kørsel

Vercel Cron kan kun køre én gang i døgnet på Hobby-planen, og mail der kommer
ind én gang i døgnet er ikke et CRM. Derfor kører planlægningen i Supabase med
`pg_cron`, som kan hvert minut uden ekstra betaling.

**Det er sat op. Herunder står hvad der blev gjort, så det kan genskabes.**

Udvidelserne `pg_cron` og `pg_net` er slået til. `pg_net` giver databasen lov
til at lave udgående HTTP-kald — en reel ny evne, ikke bare en indstilling.
Den bruges ét sted: cron-jobbet der ringer til Vercel.

Hemmeligheden ligger i Supabase Vault, ikke i jobbet:

```sql
select vault.create_secret('<MAIL_SYNC_SECRET>', 'mail_sync_secret', '...');
```

Kør den linje i SQL-editoren, **ikke** som en migration: en migration gemmes
permanent i `supabase_migrations`, og så ville hemmeligheden ligge i
historikken for altid.

Selve jobbet slår den op:

```sql
select cron.schedule(
  'mail-synk',
  '*/5 * * * *',
  $$
    select net.http_post(
      url := 'https://holmsmalertomrer-crm.vercel.app/api/messages/email/sync',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret from vault.decrypted_secrets
          where name = 'mail_sync_secret'
        )
      ),
      timeout_milliseconds := 60000
    ) as request_id;
  $$
);
```

**`timeout_milliseconds` skal sættes.** Standarden i `pg_net` er 2000 ms, og et
synk-kald tager typisk 2-3 sekunder — mere når der ligger en bunke mail. Med
standarden ville hvert eneste kald blive afbrudt, og det værste er at
`cron.job_run_details` alligevel ville vise `succeeded`: jobbet *afsendte* jo
kaldet. Fejlen ville være usynlig, og mailen ville bare aldrig komme ind.
60 sekunder matcher rutens egen `maxDuration`.

### Se om den kører

```sql
-- Sidste ti kørsler af selve jobbet
select status, start_time, end_time
from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'mail-synk')
order by start_time desc limit 10;

-- Hvad Vercel faktisk svarede. Det er her fejl bliver synlige —
-- job_run_details siger kun om kaldet blev afsendt.
select status_code, timed_out, error_msg, left(content, 200)
from net._http_response order by created desc limit 10;
```

`net._http_response` gemmer kun seks timer tilbage.

## 4. Første kørsel

Med `MAIL_SYNC_BACKFILL_DAYS=0` starter synkroniseringen ved den nyeste mail og
henter kun det der kommer derefter. Det er med vilje: uden det ville hele
postkassen — også mail fra før CRM'et fandtes — blive trukket ind 50 ad gangen.

Skal der hentes historik, så sæt variablen til antal dage **før** første kørsel.
Bagefter står der en række i `mail_sync_state`, og så bliver variablen ikke læst
igen for den mappe.

## 5. Afprøvning

```bash
curl -X POST https://<domæne>/api/messages/email/sync \
  -H "Authorization: Bearer <MAIL_SYNC_SECRET>"
```

Svarer med hvad der blev hentet pr. mappe:

```json
{
  "ok": true,
  "mapper": [
    {"folder":"INBOX","hentet":3,"gemt":1,"udenMatch":2,"fejl":null},
    {"folder":"Sent","hentet":1,"gemt":1,"udenMatch":0,"fejl":null}
  ],
  "sendtMappe": "Sent",
  "gemt": 2,
  "udenMatch": 2
}
```

Tre ting at læse i svaret:

- **`ok: true`** — så virker IMAP-oplysningerne. Er de forkerte, kommer der en
  fejl med serverens egen begrundelse i stedet.
- **`sendtMappe`** — navnet på den mappe udgående mail hentes fra. Står der
  `null`, blev den ikke fundet, og så logges kun indgående mail.
- **`udenMatch`** — mails fra afsendere der ikke er leads: nyhedsbreve,
  fakturaer, reklamer. Et højt tal er normalt.

**Verificeret 16-09-2026:** `ok: true`, og `sendtMappe` er `"Sent"` på Holms
postkasse hos Simply. Den behøver altså ikke gættes — men tjek den igen hvis
Meick skifter mailprogram, for mappenavnet følger programmet, ikke serveren.

### Hvis `sendtMappe` er null

Simply er en almindelig IMAP-server, så Sendt-mappen hedder det Meicks
mailprogram har døbt den: `Sent`, `Sendt` eller `Sendte elementer`. Koden leder
først efter IMAP-flaget `\Sent` og derefter efter de navne.

Findes den alligevel ikke, kommer **alle mappenavne på serveren** med i svaret
under `mapperPaaServeren`. Så kan det rigtige navn læses direkte der og
tilføjes i `findSentFolder()` i `lib/imap.ts`.

## Matchning

Mails kobles til leads på mailadresse, i små bogstaver og trimmet. Har den samme
kunde flere leads — tag i 2024, terrasse i 2026 — hægtes mailen på det nyeste.
Det er næsten altid den samtale der er i gang.

Citeret historik skæres fra, så den tiende mail i en tråd ikke indeholder de ni
foregående. Består mailen udelukkende af citat, vises citatet frem for ingenting.

## Skriv mail fra CRM'et

Knappen **Skriv mail** på leadet sender gennem Holms egen postkasse hos Simply,
ikke gennem en tredjepart. Kunden ser en helt almindelig mail fra
`tomrer@holmsmaler.dk`, og svarer hun, lander svaret i den rigtige indbakke og
kommer ind i CRM'et ved næste synkronisering.

Tre ting sker, og de kan fejle hver for sig:

1. **Mailen sendes** over SMTP. Fejler det, sker der ikke andet — beskeden
   bliver ikke skrevet i korrespondancen, for en mail der ikke kom af sted må
   aldrig stå som sendt.
2. **En kopi lægges i Sendt-mappen** over IMAP, så mailen også findes i Meicks
   eget mailprogram. Fejler det, siger CRM'et det, men mailen er sendt.
3. **Beskeden skrives i korrespondancen** med det samme.

CRM'et laver selv mailens Message-ID, og det er nøglen der binder de tre
sammen. Når synkroniseringen fem minutter senere finder kopien i Sendt-mappen,
genkender den id'et og springer den over. Uden det ville hver sendt mail stå to
gange.

### Miljøvariabler

| Variabel | Værdi |
|---|---|
| `SMTP_HOST` | `smtp.simply.com` |
| `SMTP_PORT` | `587` (STARTTLS). `465` virker også og er implicit TLS. |
| `SMTP_USER` | Kan udelades — falder tilbage på `IMAP_USER` |
| `SMTP_PASSWORD` | Kan udelades — falder tilbage på `IMAP_PASSWORD` |
| `MAIL_FROM_NAME` | Afsendernavnet kunden ser. Standard: `Holms Maler & Tømrer` |

> **`SMTP_HOST` har ingen fallback, med vilje.** Hos Simply er IMAP
> `mail.simply.com` og SMTP `smtp.simply.com` — to forskellige servere. Faldt
> `SMTP_HOST` tilbage på `IMAP_HOST`, ville afsendelsen ramme den forkerte
> server og fejle med en forbindelsesfejl, der intet fortæller om hvad der er
> galt.

Sættes `SMTP_HOST` ikke, åbner knappen mailprogrammet med `mailto:` som CRM'et
gjorde før. Den opfører sig altså aldrig værre end den gjorde — den bliver bare
ikke logget.

## Beskeder-siden

Fanen **Beskeder** viser alle samtaler, nyeste først, på tværs af leads. De
kunder hvor den seneste besked kom fra dem, er markeret med gul kant og
teksten "Venter på svar" — og det er det tal der står i navigationen.

Et tryk på en samtale åbner **beskedtråden alene** — ikke hele leadet.
Samtalen lå oprindeligt som en sektion nede i lead-detaljen, mellem tilbud og
historik, og det gjorde siden så lang at samtalen druknede i den. Et lead er
en sag med pris, status og noter; en samtale er noget andet. Leadet har nu kun
en enkelt linje der fører til tråden, og tråden har en "Åbn lead"-knap den
anden vej.

### Hent nye beskeder nu

Både listen og tråden har en knap der kører synkroniseringen med det samme.
Den kalder `syncMail()` direkte fra en server action frem for at gå gennem
HTTP-endpointet: det er den samme server, så en tur ud på nettet og tilbage
ville kun tilføje en hemmelighed at håndtere og en fejlkilde mere.

Cron hvert 5. minut er rigeligt til daglig drift. Knappen er til når man står
og venter på et bestemt svar.

Tallet er med vilje "hvor mange venter på svar" frem for "hvor mange samtaler".
Det første kan man gøre noget ved; det andet vokser bare.

Afsluttede og tabte leads er med i listen. De falder af sig selv nedad
efterhånden som nyere samtaler kommer til, og at skjule dem ville betyde at en
kunde der skriver igen efter et afsluttet job, forsvinder ud af oversigten —
præcis den besked man mindst har råd til at overse.

---

# Fase 2 — SMS (udskudt)

Ikke tændt. Der skal ikke gøres noget i koden for at det bliver ved med at være
sådan; uden `GATEWAYAPI_TOKEN` og `SMS_SENDER` sender CRM'et ikke selv.

**Sådan fungerer SMS i CRM'et indtil videre:** SMS-arket med skabeloner virker
som hidtil — det åbner telefonens egen SMS-app med teksten klar, og der skrives
en linje i Historik om hvilken skabelon der blev brugt. Selve beskedteksten
bliver ikke gemt, og kundens svar kommer ikke ind i CRM'et.

## Når det en dag skal tændes

1. Lej et **to-vejs-nummer** hos GatewayAPI. Meicks eget mobilnummer kan ikke
   bruges: en gateway kan kun modtage på numre den selv kontrollerer, så en SMS
   til hans SIM-kort når aldrig frem til CRM'et.
2. Sæt `GATEWAYAPI_TOKEN`, `SMS_SENDER` (nummeret med landekode, uden plus) og
   `SMS_WEBHOOK_SECRET`.
3. Peg GatewayAPIs webhook på
   `https://<domæne>/api/messages/sms/inbound?token=<SMS_WEBHOOK_SECRET>`.

Et alfanumerisk afsender-id som `Holms` kan der teknisk set ikke svares på — det
er en begrænsning i selve SMS-protokollen. Sætter man `SMS_SENDER` til et navn
frem for et nummer, virker udgående fint, men indgående forsvinder.

Når det tændes: SMS'er uden match opretter et lead i "Nye" med nummeret som navn.
Modsat mail har en SMS ikke noget andet sted at være — firmanummeret ville kun
findes her — så gemmer vi den ikke, findes den ingen steder.

## Et gratis alternativ, hvis udgiften er det eneste der stopper

Indgående SMS kan fanges uden et lejet nummer med en videresender-app på Meicks
Android-telefon, der POSTer hver modtagen SMS til et webhook. Endpointet tager
allerede imod formen:

```json
{"id": "...", "msisdn": "4512345678", "message": "...", "senttime": 1789000000}
```

Det er gratis, men skrøbeligt: det afhænger af at telefonen er tændt, at appen
ikke bliver lukket ned af batterioptimering, og at alle hans private SMS'er
passerer gennem appen. Som permanent løsning for en forretning er et rigtigt
nummer pengene værd — men som en måde at finde ud af om SMS-logning
overhovedet bliver brugt, inden der betales for det, er det rimeligt.

---

# Persondata

Korrespondancen indeholder kundernes egne beskeder. To ting følger af det:

- Nævn i privatlivspolitikken at kommunikation gemmes, og hvor længe.
- `messages` slettes sammen med leadet (`on delete cascade`). Sletter Meick et
  lead, ryger korrespondancen med.

Servicemails til en kunde der selv har henvendt sig, er uproblematiske.
Markedsføring pr. mail og SMS kræver samtykke efter markedsføringslovens § 10 —
det gælder også en "husk os til foråret" til gamle leads.
