-- Crux tables. study/setup-web.bat makes them (with a Supabase access token), or paste this into SQL Editor. Safe to run again.
-- RLS on with no policies: only the service key (the crux Vercel function) reads or writes them.
create table if not exists crux_users (
  id              text primary key,                 -- Discord user id
  name            text not null default '',
  tier            text not null default 'none' check (tier in ('none', 'trial', 'basic', 'premium', 'vvip', 'owner')),
  tier_checked_at timestamptz,
  created_at      timestamptz not null default now(),
  last_seen       timestamptz
);
-- Acrux (vvip) joined the tiers on 2026-11-13; this widens the check on tables made before that.
alter table crux_users drop constraint if exists crux_users_tier_check;
alter table crux_users add constraint crux_users_tier_check check (tier in ('none', 'trial', 'basic', 'premium', 'vvip', 'owner'));
-- The Discord picture, for the top-contributors row (added 2026-11-12).
alter table crux_users add column if not exists avatar text;
create table if not exists crux_docs (
  user_id    text primary key references crux_users (id) on delete cascade,
  doc        jsonb not null,
  rev        integer not null default 1,
  updated_at timestamptz not null default now()
);
create table if not exists crux_notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    text not null references crux_users (id) on delete cascade,
  unit       text,
  title      text not null,
  text       text not null,
  source     text not null check (source in ('obsidian', 'notion', 'file')),
  chars      integer not null,
  created_at timestamptz not null default now(),
  unique (user_id, unit, title)
);
create table if not exists crux_file_text (
  file_id    bigint primary key references files (id) on delete cascade,
  unit_code  text,
  name       text,
  paper      boolean not null default false,          -- a past paper, CAT or tutorial
  status     text not null default 'new' check (status in ('new', 'queued', 'done', 'error')),
  method     text check (method in ('pdf', 'ocr', 'docx', 'pptx', 'text', 'none')),
  pages      integer,
  chars      integer,
  text       text,
  page_starts integer[],                             -- where each page starts in text (for "read pages 3-5")
  sections   jsonb,                                  -- [[page, "3.4", "Shear Stress"]]: every numbered heading, all pages
  error      text,
  updated_at timestamptz not null default now()
);
create index if not exists crux_file_text_unit_idx on crux_file_text (unit_code);
alter table crux_file_text add column if not exists sections jsonb;
create table if not exists crux_usage (
  user_id text not null,                             -- Discord id, or 'global'
  day     date not null,                             -- Nairobi day
  kind    text not null,                             -- 'ai' | 'download' | 'ocr'
  count   integer not null default 0,
  primary key (user_id, day, kind)
);
create table if not exists crux_spend (
  month    text not null,                            -- 'YYYY-MM', Nairobi
  provider text not null,
  usd      numeric(10, 4) not null default 0,
  primary key (month, provider)
);

-- Adds one to a counter unless it has reached p_limit (p_limit >= 1).
-- Returns the new count, or null when the limit was already reached.
create or replace function crux_bump(p_user text, p_day date, p_kind text, p_limit integer)
returns integer language plpgsql as $$
declare n integer;
begin
  insert into crux_usage (user_id, day, kind, count) values (p_user, p_day, p_kind, 1)
  on conflict (user_id, day, kind) do update set count = crux_usage.count + 1
    where crux_usage.count < p_limit
  returning count into n;
  return n;
end $$;

-- Adds to this month's spend for a provider and returns the new total.
create or replace function crux_add_spend(p_month text, p_provider text, p_usd numeric)
returns numeric language sql as $$
  insert into crux_spend (month, provider, usd) values (p_month, p_provider, p_usd)
  on conflict (month, provider) do update set usd = crux_spend.usd + excluded.usd
  returning usd;
$$;

alter table crux_users     enable row level security;
alter table crux_docs      enable row level security;
alter table crux_notes     enable row level security;
alter table crux_file_text enable row level security;
alter table crux_usage     enable row level security;
alter table crux_spend     enable row level security;

-- Focus page: who is in a focus block until when. Only a count is ever read back (study/server/focus.js).
create table if not exists crux_focus (
  user_id text primary key,                          -- Discord id
  until   timestamptz not null
);
create index if not exists crux_focus_until_idx on crux_focus (until);
alter table crux_focus enable row level security;
-- The bell's new-material check reads the bot's files table by unit and time (study/server/inbox.js).
create index if not exists files_unit_created_idx on files (unit_code, created_at desc);

-- Hub announcements: written by the bot's /announce (admins only), read by the Crux bell (study/server/inbox.js).
create table if not exists crux_announcements (
  id         bigserial primary key,
  body       text not null,
  by_id      text not null,                          -- Discord id of the admin who posted it
  created_at timestamptz not null default now()
);
create index if not exists crux_announcements_at_idx on crux_announcements (created_at desc);
alter table crux_announcements enable row level security;

-- Shared unit library (fixplan D1): material derived from hub files and papers, made once per unit and shared.
create table if not exists crux_unit_kb (
  unit_code  text primary key,
  topics     jsonb not null,                         -- [{ name, subtopics: [names] }] in outline order
  updated_by text not null,
  updated_at timestamptz not null default now()
);
create table if not exists crux_question_kb (
  qkey        text primary key,                      -- sha1 of unit + the question's wording
  unit_code   text not null,
  checkpoints jsonb not null,                        -- the worked steps the AI wrote, reused for every student
  updated_at  timestamptz not null default now()
);
alter table crux_unit_kb     enable row level security;
alter table crux_question_kb enable row level security;
create table if not exists crux_kit_kb (
  kkey       text primary key,                       -- unit|kind|stage|topic
  unit_code  text not null,
  content    jsonb not null,                         -- a ladder or recipes (never a trap sheet: those are personal)
  updated_at timestamptz not null default now()
);
create table if not exists crux_class_hints (
  id         bigserial primary key,
  unit_code  text not null,
  kind       text not null,                          -- focus | exclude | note
  text       text not null,
  topics     text[] not null default '{}',           -- topic names, not ids
  by_ids     text[] not null,                        -- who heard it; only the count reaches the app
  created_at timestamptz not null default now()
);
create index if not exists crux_class_hints_unit_idx on crux_class_hints (unit_code);
alter table crux_kit_kb      enable row level security;
alter table crux_class_hints enable row level security;
-- Study rooms: a focus block can belong to a unit's room (study/server/focus.js counts per room).
alter table crux_focus add column if not exists unit_code text;
-- Files students add in Crux for the hub: the file waits in the private crux-uploads bucket, a row here says where
-- it goes, and the drive dumper (pc/src/uploader/fromcrux.js) takes it into Drop, which sorts it onto the server.
-- status: uploading (Crux gave a link) → new (uploaded) → received (on the hub PC) | failed
create table if not exists crux_uploads (
  id bigserial primary key,
  user_id text not null,
  user_name text,
  unit_code text not null,
  batch text not null,
  name text not null,
  path text not null,
  size bigint,
  status text not null default 'uploading',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists crux_uploads_status_idx on crux_uploads (status);
create index if not exists crux_uploads_user_idx on crux_uploads (user_id, created_at);
alter table crux_uploads enable row level security;
insert into storage.buckets (id, name, public, file_size_limit) values ('crux-uploads', 'crux-uploads', false, 52428800)
  on conflict (id) do nothing;

-- Hosted models for the desktop app (study/server/ai-relay.js, 2026-11-12): answers per student per Nairobi day,
-- and when Gemini last failed for them (DeepSeek is offered on Imai and Gacrux for 30 minutes after that).
create table if not exists crux_ai_usage (
  user_id          text not null references crux_users (id) on delete cascade,
  day              date not null,
  answers          integer not null default 0,
  gemini_failed_at timestamptz,
  primary key (user_id, day)
);
alter table crux_ai_usage enable row level security;

-- Track E1 (study/docs/ARCHITECTURE.md 3.3, 2026-11-15): check level and origin of a shared solution.
-- level: key (matches a printed answer) > agreed (two model families agree) > single (not double-checked).
-- A lower level never replaces a higher one (study/server/gold.js). Additive: existing rows become 'single'.
alter table crux_question_kb add column if not exists level   text not null default 'single' check (level in ('key', 'agreed', 'single'));
alter table crux_question_kb add column if not exists model   text;          -- e.g. 'opus', 'gemini-3.8-flash'
alter table crux_question_kb add column if not exists answer  text;          -- the final answer as text, for the agreement check
alter table crux_question_kb add column if not exists flagged integer not null default 0;  -- students who disputed the checkpoints
-- E1, second part: the full worked solution, shared with the level (tools/gold.js), and a student's flag counted in
-- SQL so two flags at once are both counted. Safe to run again with the lines above.
alter table crux_question_kb add column if not exists solution jsonb;  -- the full worked solution, made by tools/gold.js
create or replace function crux_flag_question(p_qkey text)
returns integer language sql as $$
  update crux_question_kb set flagged = flagged + 1 where qkey = p_qkey returning flagged;
$$;

-- Study rooms (fixplan-f, 2026-11-17): hosted rooms joined with a four-letter code. Server only (service key):
-- RLS on, no policies. The clock is a schedule (study/web/src/room-clock.js); host actions are compare-and-set on
-- version. Rows are deleted 7 days after a room ends (the daily backup cron). Wrong-code tries use crux_bump.
create table if not exists crux_rooms (
  id          bigserial primary key,
  code        text not null,                   -- 4 letters, unique among live rooms
  name        text not null,
  unit_code   text,
  host_id     text not null,                   -- Discord id
  plan        jsonb not null,                  -- { focus, short, long, longEvery, rounds, wait } in minutes
  state       text not null default 'idle',    -- idle | running | paused | waiting | done | ended
  phase       text not null default 'focus',   -- focus | short | long
  round       int not null default 1,
  phase_start timestamptz,
  left_ms     bigint,
  version     int not null default 0,
  locked      boolean not null default false,
  created_at  timestamptz not null default now(),
  ended_at    timestamptz
);
create unique index if not exists crux_rooms_live_code on crux_rooms (code) where ended_at is null;
create index if not exists crux_rooms_code on crux_rooms (code, ended_at);
create index if not exists crux_rooms_host on crux_rooms (host_id) where ended_at is null;
create table if not exists crux_room_members (
  room_id    bigint not null references crux_rooms (id) on delete cascade,
  user_id    text not null,                    -- Discord id
  name       text not null,                    -- display name at join; shown to the room
  joined_at  timestamptz not null default now(),
  seen_at    timestamptz not null default now(),
  removed    boolean not null default false,
  primary key (room_id, user_id)
);
create index if not exists crux_room_members_user on crux_room_members (user_id);
alter table crux_rooms enable row level security;
alter table crux_room_members enable row level security;

-- Study rooms, classroom tools (fixplan-f F4, 2026-11-18): today's work set by the host, and each member's check-in
-- at a break (done / partly / stuck, for one round). Until these run, those two actions say the database needs updating.
alter table crux_rooms add column if not exists work jsonb;                -- { text, fileId, fileName, page }
alter table crux_room_members add column if not exists checkin jsonb;      -- { round, how }
