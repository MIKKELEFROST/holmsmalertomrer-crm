# Lead-CRM — Holms Maler & Tømrer ApS

Et lead-CRM til en håndværkervirksomhed. Leads lander fra Meta Lead Ads
(Facebook/Instagram) og fra hjemmesidens kontaktformular. Indehaveren arbejder
primært fra mobilen i bilen; kontoret bruger desktop.

Kerneflowet er kort med vilje: se hvor mange leads der ligger i hver status →
åbn leadet → ring/SMS/mail → skriv noter, sæt pris, dato og opfølgning → flyt
status.

## Stak

- **Next.js 16** (App Router, Turbopack) + TypeScript
- **Tailwind CSS v4** til design-tokens, inline styles til komponentgeometri
- **Supabase** — Postgres, auth, filer og Row Level Security, i `eu-west-1`
  (Irland), så kundedata bliver i EU. Projektet ligger på Holms' egen
  Supabase-konto, så de ejer deres data uafhængigt af bureauet.
- **Vercel** til hosting, i `dub1` (Dublin)

### Hvorfor Dublin

`vercel.json` binder serverfunktionerne til `dub1`. Det er ikke en detalje.
Vercels standard er `iad1` i Washington, og der lå appen: hver eneste
databaseforespørgsel gik fra Washington til Irland og tilbage, mens brugeren
sad i Danmark og ventede på begge ben af turen. Målt på det live site kostede
en sideindlæsning 0,4–1,8 sekunder, næsten alt sammen ventetid på nettet.

`dub1` er den samme AWS-region som databasen, så en forespørgsel går fra
millisekunder-i-hundredvis til enkeltcifrede. Stockholm ligger tættere på
brugerne, men længere fra databasen, og siden laver flere forespørgsler pr.
indlæsning end brugeren laver sideskift — så det er nærheden til databasen der
tæller. Statiske filer serveres uændret fra Vercels netværk tættest på
brugeren; regionen gælder kun funktionerne.

Flyttes databasen nogensinde, skal `vercel.json` med.

## Kom i gang

```bash
npm install
cp .env.example .env.local   # udfyld værdierne
npm run dev
```

| Variabel | Hvad |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Projektets URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key. Må gerne ligge i klienten — den giver kun den adgang RLS tillader |
| `LEAD_INTAKE_SECRET` | Delt hemmelighed for `/api/leads/inbound`. Generér med `openssl rand -hex 32` |
| `SUPABASE_SERVICE_ROLE_KEY` | Kun server-side, bruges af intake-endpointet. **Aldrig i klienten** |
| `META_VERIFY_TOKEN` | Valgfri. Metas webhook-verifikation |

### Brugere

Der er ingen selvbetjent oprettelse. Brugere oprettes i Supabase-dashboardet
under **Authentication → Users**. Alle med et login kan se og rette alt — det
er ét internt system for én virksomhed, og adgangen styres ved hvem der
overhovedet får en bruger.

**Slå tilmelding fra** under Authentication → Sign In / Providers → Email.
Publishable-nøglen ligger i browserkoden efter hensigten, så med tilmelding
slået til kan enhver oprette sig selv og derefter læse alle kundedata —
adgangsreglerne kræver kun "logget ind", ikke "er en af os".

Glemt adgangskode går `/glemt-kode` → mail med link → `/auth/callback` →
`/ny-kode`. Det kræver at appens domæne står under Authentication → URL
Configuration, både som Site URL og på listen over tilladte redirects.
Supabases indbyggede mailserver er kraftigt begrænset i antal mails; skal
flere end et par personer bruge det, så sæt en rigtig SMTP op.

## To layouts, én app

Skiftet sker på 900px. Begge layouts renderes, og CSS vælger hvilket der vises.
Alternativet — at måle vinduet og kun rendere det ene — giver enten forkert
layout i serverens første render eller et synligt hop efter hydrering.

- **< 900px:** tre faner (Overblik / Opfølgning / Alle), fast bundnavigation,
  fuldskærms lead-detalje. Alt klikbart er mindst 44px — appen bruges med
  arbejdshandsker.
- **≥ 900px:** sidebar, KPI-række, kanban med træk-og-slip, lead i sidepanel.

`?layout=mobil` og `?layout=desktop` tvinger visningen. Kun til test.

Navigation og filtre ligger i URL'ens søgeparametre (`tab`, `view`, `lead`,
`q`, `zip`, `status`), så et lead kan sendes videre som link og tilbage-knappen
virker som forventet.

URL'en opdateres med det native history API frem for `router.push`. Siden er en
server component, så `router.push` ville hente den forfra ved hvert klik — målt
til 300–1100 ms pr. fane- eller filterskift på det live site. Alle leads ligger
allerede i browseren og filtreres lokalt, så der er intet serveren skal bidrage
med. Efter ændringen er der nul serverkald ved navigation.

## Design

`app/globals.css` holder design-tokens fra handoffen — farver, radier, skygger,
typografi. Ret aldrig en værdi der uden at rette handoffen med.

Statusfarverne er den ene undtagelse: de bor i `lib/types.ts` som
`STATUS_COLORS`, fordi de kun bruges fra JavaScript. Tailwind v4 fjerner
`@theme`-variabler den ikke kan se brugt i CSS, og som CSS-variabler forsvandt
de i byggeriet.

Statusrækkefølgen er betydningsbærende — den definerer hvad "et trin frem" og
"et trin tilbage" betyder:

> Nye → Kontaktet → Tilbud sendt → Afventer kunde → Booket → Afsluttet → Tabt

## Data

### Databasen

Migrationen ligger i `supabase/migrations/`. Tabeller: `leads`, `lead_notes`,
`lead_activity` (append-only), `lead_photos`, plus en privat storage-bucket
`lead-photos` med signerede URLs.

RLS er slået til på alt og kræver et login. `lead_activity` har kun select- og
insert-politikker, så historikken kan stoles på.

### Import fra Meta

`data/meta-eksport-original.csv` er en rigtig eksport fra Meta Lead Ads.
Formatet er ikke almindelig CSV: UTF-16LE med BOM, tab-separeret, og felter med
linjeskift indeni er citeret. Parseren i `lib/meta-import.ts` håndterer det og
er testet mod netop den fil.

`supabase/seed.sql` er de 19 rigtige leads, genereret ud fra eksporten. Den er
idempotent — `meta_id` er unik, så den kan køres igen uden dubletter.

Postnummer-opslaget i `lib/postal-codes.ts` er genereret fra Dataforsyningens
åbne API. Regenerér med `npm run build:postnumre`.

### Leads udefra

```
POST /api/leads/inbound
Authorization: Bearer <LEAD_INTAKE_SECRET>
Content-Type: application/json

{ "name": "Jens Hansen", "phone": "+4512345678", "email": "jens@example.dk",
  "zip": "2600", "description": "Nyt tag på carport", "source": "Hjemmeside" }
```

Sendes `meta_id` med, afvises dubletter på det. Endpointet er undtaget fra
login-tjekket, fordi hjemmesideformularen ikke har en brugersession — det
godkender med den delte hemmelighed i stedet.

Selve automatiseringen — Meta Lead Ads og WordPress-formularen gennem Make —
er sat på pause. `docs/lead-intake.md` har hele opsætningen klar: Facebook-side
og formular-ID'er, modulopsætningen til Make, feltmapningen og hvordan
WordPress-formularen kobles på.

## Kommandoer

| Kommando | Hvad |
|---|---|
| `npm run dev` | Udviklingsserver |
| `npm run build` | Produktionsbuild |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript uden at bygge |
| `npm run build:postnumre` | Genererer postnummerlisten |

## Uafklaret

Fra design-handoffen, og stadig åbent:

1. **Hjemmesideformularen** har intet fastlagt format. Endpointet tager imod
   det generiske JSON ovenfor; formularen skal tilpasses det.
2. **Flere brugere.** Designet antager én bruger. Skal montører kunne se deres
   egne opgaver, kræver det tildeling og roller — og RLS-politikkerne skal
   laves om fra "alle med login må alt" til ejerskab pr. række.
3. **Notifikation ved nyt lead** er ikke bygget. Appen har realtime, så et nyt
   lead popper ind i en åben fane, men der er ingen push eller mail. Et
   Meta-lead bliver koldt på timer, så det bør prioriteres.
4. **Estimeret værdi vs. tilbudspris** er to felter. Viser det sig at være
   dobbeltarbejde, kan pipelinen bygge på tilbudsprisen alene.

## Hastighed

Tre ting holder appen hurtig. De ser små ud i koden og er de eneste grunde
til at den ikke er langsom:

1. **Funktionerne kører i Dublin**, samme sted som databasen — se ovenfor.
2. **Navigation rører ikke serveren.** URL'en skrives med det native history
   API, ikke `router.push`. Alle leads ligger i browseren og filtreres der.
3. **Autogem henter ikke siden forfra.** Ingen server action kalder
   `revalidatePath("/")`. De returnerer i stedet de rækker de har skabt —
   historikposten, noten, det nye lead, billedet med sin signerede URL — og
   klienten fletter dem ind i listen den allerede har. Det er ikke et gæt om
   hvad serveren gjorde; det er rækkerne med deres rigtige id'er og
   tidsstempler.

Sætter man `revalidatePath("/")` tilbage i en handling, koster hvert eneste
blur i et felt en fuld genindlæsning af alle leads, noter, historik og
billeder. Det er den fælde der gjorde appen langsom første gang.

Serveren spørger heller ikke Supabase hvem brugeren er ved hvert kald:
`getClaims()` verificerer token'et lokalt mod projektets ES256-nøgle, hvor
`getUser()` ville koste en netværkstur pr. sideindlæsning og pr. skrivning.

Sidefunktionen i `app/page.tsx` er bevidst ikke `async`. Skallen strømmer ud
med det samme, så browseren kan hente CSS, fonte og JavaScript mens
databasen svarer, i stedet for at vente på begge dele efter hinanden.

### Hvad der stadig kan mærkes

Første besøg efter en pause er langsommere end de næste — Vercel starter
serverfunktionen op, og på Hobby-planen sker det ofte, fordi appen bruges af
to personer nogle gange om dagen. Det ligger i hostingen, ikke i koden.
Vercels **Fluid compute** (Settings → Functions) holder instanser varme
længere og er den knap der findes for det.

Alle leads hentes ved hver sideindlæsning. Ved et par hundrede er det
hurtigere end at spørge serveren for hvert filterklik. Skal det op i
tusinder, er det `getLeads()` i `lib/leads.ts` der skal sideinddeles.
