-- Korrespondance: mails og SMS'er samlet ét sted, knyttet til leadet.
--
-- Før det her lå kommunikationen tre steder: mails i Meicks mailprogram,
-- SMS'er på hans telefon, og CRM'et vidste kun at der var "sendt en SMS".
-- Tabellen herunder er det samlede spor. Den fyldes af to ingest-endpoints
-- (IMAP-synk og GatewayAPI-webhook), ikke af brugeren direkte.

-- ---------------------------------------------------------------------------
-- Typer
-- ---------------------------------------------------------------------------

create type message_channel as enum ('email', 'sms');

-- 'ind' = fra kunden til os. 'ud' = fra os til kunden. Dansk frem for
-- inbound/outbound, så det matcher resten af domænesproget i UI'et.
create type message_direction as enum ('ind', 'ud');

-- ---------------------------------------------------------------------------
-- Matchning
-- ---------------------------------------------------------------------------

-- Et telefonnummer skrives på fem måder for den samme kunde: "12 34 56 78",
-- "+45 12345678", "004512345678", "12345678". Uden en fælles nøgle matcher
-- en indkommende SMS ikke leadet, og beskeden lander i uafklaret.
--
-- De sidste otte cifre er nøglen. Danske numre er otte cifre, så landekode og
-- udlandsprefiks falder af sig selv. Et udenlandsk nummer kan i teorien ramme
-- forbi, men Holms kunder er danske husejere — den dag det bliver et problem,
-- skal der gemmes en rigtig E.164-kolonne i stedet.
--
-- immutable, fordi den indgår i et indeks.
create or replace function public.phone_key(raw text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when length(regexp_replace(coalesce(raw, ''), '\D', '', 'g')) < 8 then null
    else right(regexp_replace(raw, '\D', '', 'g'), 8)
  end;
$$;

-- Opslag fra en indkommende besked til leadet. Uden de her to indekser bliver
-- hver eneste mail og SMS en fuld scanning af leads-tabellen.
create index leads_email_key_idx
  on public.leads (lower(btrim(email)))
  where email is not null;

create index leads_phone_key_idx
  on public.leads (public.phone_key(phone))
  where phone is not null;

-- Opslaget fra en besked til et lead. Ligger i databasen frem for i koden,
-- fordi PostgREST ikke kan udtrykke "lower(email) = x" — og uden præcis det
-- udtryk bliver indekserne ovenfor aldrig brugt.
--
-- Har den samme kunde flere leads (gengangere findes — tag i 2024, terrasse i
-- 2026), hægtes beskeden på det nyeste. Det er næsten altid den samtale der
-- er i gang.
create or replace function public.lead_for_email(addr text)
returns uuid
language sql
stable
set search_path = ''
as $$
  select id from public.leads
  where email is not null
    and lower(btrim(email)) = lower(btrim(addr))
  order by created_time desc
  limit 1;
$$;

create or replace function public.lead_for_phone(raw text)
returns uuid
language sql
stable
set search_path = ''
as $$
  select id from public.leads
  where phone is not null
    and public.phone_key(raw) is not null
    and public.phone_key(phone) = public.phone_key(raw)
  order by created_time desc
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- messages
-- ---------------------------------------------------------------------------

create table public.messages (
  id uuid primary key default gen_random_uuid(),

  -- Må være null, men er det i praksis sjældent: en SMS fra et ukendt nummer
  -- får oprettet et lead, og mails uden match gemmes slet ikke (de ligger
  -- stadig i postkassen). Null er reserven for den dag lead-oprettelsen
  -- fejler — så er beskeden stadig gemt frem for tabt.
  lead_id uuid references public.leads (id) on delete cascade,

  channel    message_channel   not null,
  direction  message_direction not null,

  -- Afsenderens egen id: Message-ID fra mailheaderen, beskedens id hos
  -- GatewayAPI. Synkroniseringen kører forfra efter en UIDVALIDITY-nulstilling
  -- og henter ved genforsøg de samme beskeder igen; unique-constrainten
  -- nedenfor er det der gør, at de ikke bliver oprettet to gange.
  external_id text not null,

  -- Modpartens mailadresse eller telefonnummer, sådan som den stod i
  -- beskeden. Gemmes selvom lead_id er sat, så en senere rettelse af leadets
  -- kontaktoplysninger ikke omskriver historikken.
  counterparty text not null,

  subject text,
  body    text not null default '',

  -- Da beskeden blev sendt ifølge afsenderen, ikke da vi hentede den.
  -- Rækkefølgen i en tråd skal følge samtalen, ikke synkroniseringen.
  sent_at    timestamptz not null,
  created_at timestamptz not null default now(),

  constraint messages_external_id_unique unique (channel, external_id),
  constraint messages_counterparty_not_blank check (length(btrim(counterparty)) > 0)
);

create index messages_lead_id_idx on public.messages (lead_id, sent_at desc);

-- Beskeder der endte uden lead. Delvist indeks, fordi det forventeligt er en
-- håndfuld rækker ud af mange tusinde.
create index messages_unmatched_idx
  on public.messages (sent_at desc)
  where lead_id is null;

-- ---------------------------------------------------------------------------
-- mail_sync_state — hvor langt IMAP-synkroniseringen er nået
-- ---------------------------------------------------------------------------

-- Uden den her ville hver kørsel hente hele indbakken igen. Én række pr.
-- mappe (INBOX og Sendt).
create table public.mail_sync_state (
  folder       text primary key,
  uid_validity bigint,
  last_uid     bigint      not null default 0,
  last_run_at  timestamptz,
  last_error   text
);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.messages enable row level security;
alter table public.mail_sync_state enable row level security;

create policy "beskeder kan laeses af brugere med login"
  on public.messages for select to authenticated using (true);

-- Insert er til udgående SMS sendt fra CRM'et. Indgående skrives af
-- ingest-endpointet med service role, som går uden om RLS.
create policy "beskeder kan oprettes af brugere med login"
  on public.messages for insert to authenticated with check (true);

-- Update findes udelukkende for at kunne hægte en uafklaret besked på et
-- lead. Selve teksten bør ingen rette i — men RLS kan ikke skelne på kolonne,
-- så den grænse er UI'ets ansvar, ikke databasens.
create policy "beskeder kan tilknyttes et lead"
  on public.messages for update to authenticated using (true) with check (true);

-- Ingen delete-politik: korrespondance slettes ikke, den følger leadet via
-- on delete cascade.

-- mail_sync_state får ingen politikker med vilje. Den er maskinens eget
-- bogholderi og skal kun kunne røres med service role.

-- ---------------------------------------------------------------------------
-- Realtime — så en ny mail eller SMS dukker op uden refresh
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.messages;
