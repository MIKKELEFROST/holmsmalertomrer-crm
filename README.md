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
- **Supabase** — Postgres, auth, filer og Row Level Security, i `eu-central-1`
  (Frankfurt), så kundedata bliver i EU
- **Vercel** til hosting

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
