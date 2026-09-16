# Korrespondance — mails og SMS i CRM'et

Formålet er at kommunikationen med en kunde står ét sted — på leadet — frem for
spredt mellem Meicks mailprogram og hans telefon.

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

Simply bruger `mail.simply.com` til IMAP. Port 993 er SSL/TLS hele vejen og er
den koden regner med; 143 med STARTTLS virker også, men så skal `IMAP_PORT`
sættes til `143`.

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

Vercel Cron kan kun køre én gang i døgnet på Hobby-planen, og det er for lidt.
Brug i stedet Supabase, som kan køre hvert minut uden ekstra betaling. Slå
`pg_cron` og `pg_net` til under Database → Extensions, og kør så:

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
