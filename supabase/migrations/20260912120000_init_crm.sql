-- Lead-CRM til Holms Maler & Tømrer ApS
--
-- Én virksomhed, få brugere. Alle med et login må se og rette alt; adgangen
-- styres ved hvem der overhovedet får en bruger. Derfor er RLS-politikkerne
-- "authenticated må alt" frem for ejerskab pr. række. Skal montører senere
-- kun se egne opgaver, er det her det skal laves om.

-- ---------------------------------------------------------------------------
-- Typer
-- ---------------------------------------------------------------------------

-- Rækkefølgen er betydningsbærende: den definerer hvad et trin frem og et
-- trin tilbage betyder i UI'et.
create type lead_status as enum (
  'Nye',
  'Kontaktet',
  'Tilbud sendt',
  'Afventer kunde',
  'Booket',
  'Afsluttet',
  'Tabt'
);

create type duration_unit as enum ('timer', 'dage', 'uger');

-- ---------------------------------------------------------------------------
-- leads
-- ---------------------------------------------------------------------------

create table public.leads (
  id uuid primary key default gen_random_uuid(),

  -- Fra Meta. meta_id er den unikke nøgle der forhindrer dubletter ved
  -- import; manuelt oprettede leads har ingen.
  meta_id           text unique,
  created_time      timestamptz not null default now(),
  platform          text,
  campaign_name     text,
  ad_name           text,
  form_name         text,
  meta_lead_status  text,

  -- Kontakt. Kommer fra Meta, men skal kunne rettes.
  name          text not null,
  email         text,
  phone         text,
  zip           text,
  city          text,
  description   text,

  -- Meick udfylder selv.
  status          lead_status   not null default 'Nye',
  address         text,
  tags            text[]        not null default '{}',
  value           integer,
  price           integer,
  start_date      date,
  duration_value  numeric(6, 1),
  duration_unit   duration_unit default 'dage',
  follow_up       date,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint leads_name_not_blank check (length(btrim(name)) > 0),
  constraint leads_value_non_negative check (value is null or value >= 0),
  constraint leads_price_non_negative check (price is null or price >= 0),
  constraint leads_duration_positive check (duration_value is null or duration_value > 0)
);

-- Boardet grupperer på status, opfølgningsfanen sorterer på follow_up, og
-- listerne sorterer nyeste først.
create index leads_status_idx on public.leads (status);
create index leads_follow_up_idx on public.leads (follow_up) where follow_up is not null;
create index leads_created_time_idx on public.leads (created_time desc);

-- ---------------------------------------------------------------------------
-- Relationer
-- ---------------------------------------------------------------------------

create table public.lead_notes (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references public.leads (id) on delete cascade,
  text        text not null,
  author      text not null default 'Meick',
  created_at  timestamptz not null default now(),

  constraint lead_notes_text_not_blank check (length(btrim(text)) > 0)
);

create index lead_notes_lead_id_idx on public.lead_notes (lead_id, created_at desc);

-- Append-only log. Ingen update- eller delete-politik nedenfor, med vilje:
-- historikken skal kunne stoles på.
create table public.lead_activity (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references public.leads (id) on delete cascade,
  what        text not null,
  who         text not null default 'Meick',
  created_at  timestamptz not null default now()
);

create index lead_activity_lead_id_idx on public.lead_activity (lead_id, created_at desc);

create table public.lead_photos (
  id             uuid primary key default gen_random_uuid(),
  lead_id        uuid not null references public.leads (id) on delete cascade,
  path           text not null unique,
  original_name  text,
  created_at     timestamptz not null default now()
);

create index lead_photos_lead_id_idx on public.lead_photos (lead_id, created_at);

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger leads_set_updated_at
  before update on public.leads
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.leads enable row level security;
alter table public.lead_notes enable row level security;
alter table public.lead_activity enable row level security;
alter table public.lead_photos enable row level security;

create policy "leads kan laeses af brugere med login"
  on public.leads for select to authenticated using (true);
create policy "leads kan oprettes af brugere med login"
  on public.leads for insert to authenticated with check (true);
create policy "leads kan rettes af brugere med login"
  on public.leads for update to authenticated using (true) with check (true);
create policy "leads kan slettes af brugere med login"
  on public.leads for delete to authenticated using (true);

create policy "noter kan laeses af brugere med login"
  on public.lead_notes for select to authenticated using (true);
create policy "noter kan oprettes af brugere med login"
  on public.lead_notes for insert to authenticated with check (true);
create policy "noter kan slettes af brugere med login"
  on public.lead_notes for delete to authenticated using (true);

-- Historik: kun læs og tilføj. Ingen update/delete-politik = ingen adgang.
create policy "historik kan laeses af brugere med login"
  on public.lead_activity for select to authenticated using (true);
create policy "historik kan tilfoejes af brugere med login"
  on public.lead_activity for insert to authenticated with check (true);

create policy "billeder kan laeses af brugere med login"
  on public.lead_photos for select to authenticated using (true);
create policy "billeder kan oprettes af brugere med login"
  on public.lead_photos for insert to authenticated with check (true);
create policy "billeder kan slettes af brugere med login"
  on public.lead_photos for delete to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Storage — kundebilleder fra byggepladsen. Privat bucket, signerede URLs.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'lead-photos',
  'lead-photos',
  false,
  10485760, -- 10 MB. Klienten komprimerer til ~1600px/JPEG 0.8 før upload.
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
);

create policy "leadbilleder kan laeses af brugere med login"
  on storage.objects for select to authenticated
  using (bucket_id = 'lead-photos');

create policy "leadbilleder kan uploades af brugere med login"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'lead-photos');

create policy "leadbilleder kan slettes af brugere med login"
  on storage.objects for delete to authenticated
  using (bucket_id = 'lead-photos');

-- ---------------------------------------------------------------------------
-- Realtime — så et nyt Meta-lead popper ind uden refresh
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.leads;
