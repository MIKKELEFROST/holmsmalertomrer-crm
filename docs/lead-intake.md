# Automatisk lead-modtagelse

> **Status: sat på pause.** Endpointet i CRM'et er bygget og klar. Make-siden
> er undersøgt og alle nødvendige ID'er er fundet (se nedenfor), men
> scenarierne er ikke oprettet endnu. Dokumentet her indeholder alt hvad der
> skal bruges for at gøre det færdigt.

Der er to veje ind i CRM'et: Meta Lead Ads (Facebook og Instagram) og
hjemmesidens kontaktformular. Begge går gennem Make og rammer det samme
endpoint.

```
Meta Lead Ads ─┐
               ├─→ Make ─→ POST /api/leads/inbound ─→ CRM
WordPress-form ┘
```

Make ligger i midten frem for at pege Meta direkte på CRM'et, fordi Make giver
kø, genforsøg og et sted at se hvad der faktisk kom ind, når et lead mangler.

## Endpointet

Bygget og klar. Se `app/api/leads/inbound/route.ts`.

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

**Hemmeligheden** genereres med `openssl rand -hex 32` og skal stå både i
Vercels miljøvariabler og i Make-scenariernes Authorization-header. Generér en
frisk en når I deployer — brug ikke en der har været forbi en chat eller en log.

## Rute 1 — Meta Lead Ads

### Fundne ID'er

| Hvad | Værdi |
|---|---|
| Facebook-side | Holms Maler & Tømrer Entreprise ApS (Hvidovre) |
| Page ID | `1143807065478844` |
| Formular (aktiv) | `08.05.26-copy` → `1493450252272167` |
| Formular (ældre) | `08.05.26` → `975087995453059` |
| Make-forbindelse | `frostmikkel99` (id `14589446`) — har adgang til siden |
| Make team / org | `1576827` / `3412853` |

Formularens felter, som de kommer fra Meta:
`full_name`, `email`, `phone_number`, `postnummer`,
`hvad_kan_vi_hjælpe_med?_(beskriv_din_opgave)`.

Bemærk at Meta leverer hvert svar som et **array** — derfor `first(...)` i
mapningen nedenfor. Telefonnumre kommer som `p:+45…` og postnummeret som ren
tekst; endpointet renser begge dele, så Make behøver ikke.

### Scenariet

Tre moduler. Mønsteret er lånt fra det eksisterende
`Carelax | Meta Lead Ads → Pipedrive`, som kører samme opsætning.

1. **Facebook Lead Ads → Watch Leads** (`facebook-lead-ads:NewEvent`, v1)
   Instant trigger. Hooket bindes til page `1143807065478844`. Lad
   formularfeltet stå tomt, så alle formularer på siden fanges — ellers
   forsvinder leads i stilhed den dag der laves en ny formular.

2. **Facebook Lead Ads → Get Leadgen** (`facebook-lead-ads:GetLeadgen`, v1)
   `mapper: { id: "{{1.leadgenId}}" }`,
   `parameters: { account: 14589446, pageId: "1143807065478844", formId: "1493450252272167" }`.
   Trigger'en giver kun et leadgen-id; det er her selve svarene hentes.

3. **HTTP → Make a request** (`http:ActionSendData`, v3)
   `POST` til `<CRM-URL>/api/leads/inbound`, `bodyType: "raw"`,
   header `Authorization: Bearer <hemmelighed>` og
   `Content-Type: application/json`. Body:

   ```json
   {
     "meta_id": "l:{{1.leadgenId}}",
     "created_time": "{{1.dateCreated}}",
     "full_name": "{{first(2.data.full_name)}}",
     "email": "{{first(2.data.email)}}",
     "phone_number": "{{first(2.data.phone_number)}}",
     "postnummer": "{{first(2.data.postnummer)}}",
     "description": "{{first(get(2.data; \"hvad_kan_vi_hjælpe_med?_(beskriv_din_opgave)\"))}}",
     "source": "Meta Lead Ads",
     "campaign_name": "{{2.campaignName}}",
     "ad_name": "{{2.adName}}",
     "form_name": "{{2.formName}}"
   }
   ```

   `meta_id` skal have `l:`-prefikset, så det matcher de 19 leads der allerede
   er importeret fra CSV-eksporten — ellers bliver de samme leads oprettet igen.

   **Om platformen:** CSV-eksporten har en `platform`-kolonne med `fb` og `ig`,
   men det er ikke bekræftet at webhooken leverer den. Derfor sendes `source`
   som "Meta Lead Ads" her. Kør ét rigtigt lead igennem, kig på hvad modul 2
   faktisk returnerer, og skift til `"platform": "{{2.platform}}"` hvis feltet
   er der — endpointet oversætter selv `fb` til Facebook og `ig` til Instagram.
   Indtil da fortæller annoncenavnet hvor leadet kom fra.

## Rute 2 — WordPress-formularen

1. Opret et **Custom webhook** i Make. Make giver en URL i stil med
   `https://hook.eu2.make.com/<id>`.
2. Kobl formularen på den URL. Alle tre gængse plugins kan det:
   - **WPForms** — Settings → Webhooks (kræver Pro)
   - **Gravity Forms** — Webhooks add-on
   - **Contact Form 7** — kræver et tillæg, fx CF7 to Webhook
   Send felterne som JSON med navnene `name`, `phone`, `email`, `zip`,
   `description`. Andre navne virker også, så længe de matcher tabellen øverst.
3. Tilføj et **HTTP → Make a request**-modul magen til punkt 3 ovenfor, men med
   `"source": "Hjemmeside"` og uden `meta_id`.

Uden `meta_id` er der ingen dubletkontrol. Sender kunden formularen to gange,
kommer der to leads. Det er med vilje — to henvendelser fra samme person kan
være to forskellige opgaver, og det er lettere at slette et lead end at opdage
et der aldrig kom.

## Test

Endpointet kan afprøves uden Make:

```bash
curl -X POST https://<CRM-URL>/api/leads/inbound \
  -H "Authorization: Bearer $LEAD_INTAKE_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Testesen","phone":"+4512345678","zip":"2600",
       "description":"Nyt tag på carport","source":"Hjemmeside"}'
```

Leadet skal dukke op i CRM'et under **Nye** med by "Glostrup" udfyldt
automatisk, og en historikpost der siger hvor det kom fra.

## Direkte Meta-webhook uden Make

Endpointet svarer også på Metas verifikations-`GET` (`hub.challenge`), hvis
`META_VERIFY_TOKEN` er sat. Selve leadgen-hentningen fra Graph API er ikke
bygget — den kræver en page access token og en Meta-app i review. Make er
hurtigere at komme i luften med, og giver kø og genforsøg oveni.
