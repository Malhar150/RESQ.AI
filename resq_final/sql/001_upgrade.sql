-- ===========================================================================
-- RESQ.AI — upgrade the reports table
--
-- HOW TO RUN THIS
--   1. Open your Supabase project (the one called resq-ai).
--   2. Left sidebar -> SQL Editor -> New query.
--   3. Paste this whole file in and press Run.
--   4. Restart the backend. On boot it should print:
--        [schema] Upgraded schema detected. All features on.
--
-- It is safe to run more than once — every statement checks first.
-- Your existing 15 seeded reports are kept; they just get default values
-- for the new columns.
-- ===========================================================================

-- --- New columns -----------------------------------------------------------

alter table public.reports
  -- Set by the reporting device, not the server. Lets a phone retry a queued
  -- mesh report without creating a duplicate.
  add column if not exists client_id text,

  -- 64-bit perceptual hash of the photo, as 16 hex characters. Two reports
  -- with near-identical hashes are showing the same picture.
  add column if not exists photo_hash text,

  -- flood | landslide | storm | earthquake | fire | building_collapse |
  -- medical | infrastructure | other
  add column if not exists hazard_type text,

  -- ISO 639-1 code the report was written in (en, hi, as, bn, ...).
  add column if not exists language text,

  -- 0-100. How much the control room should believe this report.
  add column if not exists trust_score integer,

  -- The individual signals behind that score, so an officer can see why.
  add column if not exists flags jsonb default '[]'::jsonb,

  -- How sure the classifier was about the severity it assigned.
  add column if not exists ai_confidence numeric,

  -- Which classifier produced it, e.g. "gemini:gemini-2.0-flash" or "rules-v2".
  add column if not exists ai_model text,

  -- Salted hash of the reporter's IP. Lets us spot one device spamming
  -- without ever storing anyone's IP address.
  add column if not exists reporter_hash text,

  -- When an officer marked it verified.
  add column if not exists verified_at timestamptz;

-- --- Constraints -----------------------------------------------------------

-- One report per client_id. This is what makes mesh sync safely repeatable.
create unique index if not exists reports_client_id_key
  on public.reports (client_id)
  where client_id is not null;

-- --- Indexes for the dashboard --------------------------------------------
-- The feed filters on these constantly; without indexes it gets slow as the
-- table grows past a few thousand rows.

create index if not exists reports_created_at_idx on public.reports (created_at desc);
create index if not exists reports_severity_idx   on public.reports (severity);
create index if not exists reports_status_idx     on public.reports (status);
create index if not exists reports_source_idx     on public.reports (source);
create index if not exists reports_hazard_idx     on public.reports (hazard_type);
create index if not exists reports_photo_hash_idx on public.reports (photo_hash)
  where photo_hash is not null;

-- --- Backfill --------------------------------------------------------------
-- Give the seeded demo rows sensible values so the dashboard isn't full of
-- blank cells before any new report arrives.

update public.reports
   set trust_score = case
         when severity = 'high'   then 72
         when severity = 'medium' then 64
         else 58
       end
 where trust_score is null;

update public.reports
   set flags = '[{"code":"seed","label":"Seeded demo data","detail":"Loaded before trust scoring existed.","delta":0}]'::jsonb
 where flags is null or flags = '[]'::jsonb;

update public.reports
   set language = 'en'
 where language is null;

update public.reports
   set ai_model = 'seed'
 where ai_model is null;

-- Guess a hazard type for the seeded rows from their wording.
update public.reports
   set hazard_type = case
         when description ~* 'flood|water|inundat|বন্যা|बाढ़'      then 'flood'
         when description ~* 'landslide|mudslide|ভূমিস্খলন|भूस्खलन' then 'landslide'
         when description ~* 'cyclone|storm|ঝড়|तूफ'               then 'storm'
         when description ~* 'fire|আগুন|आग'                        then 'fire'
         when description ~* 'road|bridge|power|পথ|सड़क'           then 'infrastructure'
         else 'other'
       end
 where hazard_type is null;

-- ===========================================================================
-- OPTIONAL: tighten security before this goes anywhere public.
--
-- Right now Row Level Security lets anyone read and write. That's fine for a
-- demo. When you're ready, uncomment the block below: it keeps inserts and
-- reads open (citizens need both) but blocks updates and deletes from the
-- browser, so only this backend — which holds ADMIN_KEY — can verify or
-- delete a report.
-- ===========================================================================

-- alter table public.reports enable row level security;
--
-- drop policy if exists "anyone can report"   on public.reports;
-- drop policy if exists "anyone can read"     on public.reports;
-- drop policy if exists "no browser updates"  on public.reports;
-- drop policy if exists "no browser deletes"  on public.reports;
--
-- create policy "anyone can report" on public.reports
--   for insert to anon, authenticated with check (true);
--
-- create policy "anyone can read" on public.reports
--   for select to anon, authenticated using (true);
--
-- -- No update/delete policies means update and delete are denied for anon.
-- -- Give the backend a service_role key in that case.
