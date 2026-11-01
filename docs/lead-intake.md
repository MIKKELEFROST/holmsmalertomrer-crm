# Lead-modtagelse

> **Status (verificeret i Make 1. november 2026):** Meta-leads kører automatisk
> ind i CRM'et via Make og har gjort det siden 14. september 2026.
> Hjemmesidens kontaktformular går **ikke** i CRM'et — den sender en mail.
> Endpointet `/api/leads/inbound` er bygget, men intet bruger det i dag.

```
Meta Lead Ads (FB/IG) ─→ Make ─→ Supabase RPC ingest_meta_lead ─→ CRM
                                    └─→ mail "NYT LEAD" til tomrer@holmsmaler.dk

holmsmaler.dk-formular ─→ api/lead.js (holmsmaler-dk) ─→ mail via Resend
```

Make ligger i midten, fordi Make giver kø, genforsøg og et sted at se, hvad der
faktisk kom ind, når et lead mangler.

## Rute 1 — Meta Lead Ads (kører)

### ID'er

| Hvad | Værdi |
|---|---|
| Make-scenarie | `Holms Maler \| Meta Lead Ads → Supabase CRM` (id `9807778`) |
| Make-webhook | `Holms Maler – Meta Lead Ads` (id `4372751`) |
| Backfill-scenarie | `Holms Maler \| Backfill Meta leads → Supabase (manuel)` (id `9807783`) |
| Facebook-side | Holms Maler & Tømrer Entreprise ApS — `1143807065478844` |
| Formular (aktiv) | `08.05.26-copy` → `1493450252272167` |
| Formular (ældre) | `08.05.26` → `975087995453059` |
| Make-forbindelse, Facebook | `frostmikkel99` (id `14589446`) |
| Make-forbindelse, Gmail | Mikkels Gmail (id `14594363`) |
| Make team / org | `1576827` / `3412853` |

### Scenariet, modul for modul

1. **Facebook Lead Ads → Watch leads (multiple forms)**
   (`facebook-lead-ads:NewLeadMultiple`). Instant trigger, bundet til siden
   `1143807065478844` **uden formularfilter**. Alle formularer på siden fanges,
   også nye — de nye annoncer fra 1. november bruger samme formular som før.
2. **Facebook Lead Ads → Get form** — henter formularens navn.
3. **HTTP GET** `api.dataforsyningen.dk/postnumre?nr=<postnummer>` — slår
   byen op ud fra postnummeret.
4. **HTTP POST** til Supabase-RPC'en `ingest_meta_lead`
   (`https://wwptdpflareijqqqhvml.supabase.co/rest/v1/rpc/ingest_meta_lead`,
   form-urlencoded). Sender `leadgen_id`, `created_time`, `platform`,
   `campaign_name`, `ad_name`, `form_id`, `form_name`, `full_name`, `email`,
   `phone`, `zip`, `city`, `description` og en delt hemmelighed `p_secret`.
   Hemmeligheden står kun i Make-scenariet — skriv den ikke ind her. RPC'en
   opretter leadet (+ `lead_activity`) og svarer `inserted: true`, eller
   `false` hvis `meta_id` allerede findes.
5. **Gmail → Send mail** "NYT LEAD" til `tomrer@holmsmaler.dk`, cc
   `mikkel@onlinemarketing.nu`, med link til CRM'et. Kører kun når
   `inserted = true`, så dubletter ikke giver mail. Fejl i mail-modulet ignoreres.

**Formularfelterne er hårdkodet i modul 3 og 4:** `full_name`, `email`,
`phone_number`, `postnummer` og `hvad_kan_vi_hjælpe_med?_(beskriv_din_opgave)`.
Laves der en ny formular med andre spørgsmål, kommer leadet stadig ind, men
uden postnummer/by og opgavebeskrivelse. Kopiér den eksisterende formular, når
der skal laves en ny.

**`ingest_meta_lead` findes kun i databasen** — den ligger ikke i
`supabase/migrations/`. Genopbygges databasen fra migrationerne, skal funktionen
oprettes igen, ellers fejler modul 4.

### Kendt fejl: Facebook-forbindelsen udløber

Er sket 8. og 18. oktober 2026. Modul 1 fejler med `InvalidAccessTokenError …
The session has been invalidated because the user changed their password or
Facebook has changed the session for security reasons`. Make deaktiverer
scenariet, og nye leads lægges i webhookens kø. De er ikke tabt, men der
kommer ingen leads i CRM'et og ingen mails, før det er rettet.

Sådan rettes det:

1. **Genautorisér den eksisterende forbindelse** `frostmikkel99` (id
   `14589446`) i Make → Connections → Reauthorize. Opret ikke en ny
   forbindelse: webhooken peger på id `14589446` og kan ikke flyttes.
2. Aktivér scenariet igen. Leads i køen køres automatisk — med mail til Meick
   som normalt.
3. Mangler der stadig leads, så kør backfill-scenariet manuelt. Det henter de
   10 seneste leads fra formular `1493450252272167` og springer dubletter over.
   **Backfill sender ingen mail** — giv Meick besked selv. Det er sandsynligvis
   derfor, leadet fra 8. oktober aldrig gav en "NYT LEAD"-mail: backfill kørte
   kl. 07:04–07:06 den 9. oktober, og da køen blev kørt kl. 07:07, stoppede
   kørslen før mail-modulet (4 operationer = dublet).

Samme Facebook-forbindelse bruges også af Carelax-scenarierne. Den fulde
beskrivelse af forbindelserne og nedbruddet 8.–9. oktober står i
`routines/make-forbindelser.md` i `fbads`-repoet (PR #7, endnu ikke flettet).

### Kontrol

Antallet af leads i Meta Ads (feltet `lead` pr. dag) skal stemme med antallet
af "NYT LEAD"-mails og med succesfulde kørsler i Make. En kørsel med 5
operationer er et nyt lead med mail; 4 operationer er en dublet. Rutinen i
`fbads`-repoet (`routines/holmsmaler-leads.md`) laver denne kontrol.

## Rute 2 — Hjemmesiden (går ikke i CRM'et)

Formularen på holmsmaler.dk poster til `api/lead.js` i `holmsmaler-dk`-repoet,
som sender en mail via Resend til `LEAD_TO_EMAIL` med emnet
"Nyt lead fra holmsmaler.dk (tømrer) – <navn>". Leadet skal tastes ind i
CRM'et i hånden.

Skal hjemmeside-leads automatisk i CRM'et, er den korteste vej at lade
`api/lead.js` også poste til `/api/leads/inbound` (se nedenfor) med
`"source": "Hjemmeside"` og uden `meta_id`. Uden `meta_id` er der ingen
dubletkontrol — med vilje: to henvendelser fra samme person kan være to opgaver.

## Endpointet `/api/leads/inbound` (bygget, ikke i brug)

Se `app/api/leads/inbound/route.ts`.

```
POST /api/leads/inbound
Authorization: Bearer <LEAD_INTAKE_SECRET>
Content-Type: application/json
```

| Felt | Påkrævet | Note |
|---|---|---|
| `name` / `full_name` | ja | Uden navn afvises leadet |
| `phone` / `phone_number` | nej | `p:`-prefiks strippes automatisk |
| `email` | nej | |
| `zip` / `postnummer` | nej | Byen slås op lokalt |
| `address` | nej | Postnummer udtrækkes hvis `zip` mangler |
| `description` / `message` | nej | Kundens egen tekst |
| `source` / `platform` | nej | Default "Hjemmeside". `fb`/`ig` oversættes |
| `meta_id` / `id` | nej | Sendes den, afvises dubletter på den |
| `created_time` | nej | Default nu |
| `campaign_name`, `ad_name`, `form_name` | nej | |

Svar: `201` med `{ok: true, id}` ved nyt lead, `200` med
`{ok: true, duplicate: true}` hvis `meta_id` fandtes i forvejen, `401` ved
forkert hemmelighed.

**Hemmeligheden** genereres med `openssl rand -hex 32` og skal stå i Vercels
miljøvariabler og hos den, der kalder endpointet. Brug ikke en, der har været
forbi en chat eller en log.

Endpointet kan afprøves sådan:

```bash
curl -X POST https://<CRM-URL>/api/leads/inbound \
  -H "Authorization: Bearer $LEAD_INTAKE_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Testesen","phone":"+4512345678","zip":"2600",
       "description":"Nyt tag på carport","source":"Hjemmeside"}'
```

Leadet skal dukke op i CRM'et under **Nye** med by "Glostrup" udfyldt
automatisk, og en historikpost der siger, hvor det kom fra.

Endpointet svarer også på Metas verifikations-`GET` (`hub.challenge`), hvis
`META_VERIFY_TOKEN` er sat, men selve hentningen af leads fra Graph API er ikke
bygget. Meta-leads går i dag uden om endpointet, direkte fra Make til
Supabase-RPC'en.
