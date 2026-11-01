-- Crux tables. study/setup-web.bat makes them (with a Supabase access token), or paste this into SQL Editor. Safe to run again.
-- RLS on with no policies: only the service key (the crux Vercel function) reads or writes them.
create table if not exists crux_users (
  id              text primary key,                 -- Discord user id
  name            text not null default '',
  tier            text not null default 'none' check (tier in ('none', 'trial', 'basic', 'premium', 'owner')),
  tier_checked_at timestamptz,
  created_at      timestamptz not null default now(),
  last_seen       timestamptz
);
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
  status     text not null default 'new' check (status in ('new', 'queued', 'done', 'error')),
  method     text check (method in ('pdf', 'ocr', 'docx', 'pptx', 'text', 'none')),
  pages      integer,
  chars      integer,
  text       text,
  questions  jsonb,                                  -- parsed past-paper questions, shared by everyone
  error      text,
  updated_at timestamptz not null default now()
);
create index if not exists crux_file_text_unit_idx on crux_file_text (unit_code);
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
