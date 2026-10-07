-- Engineering Study Hub bot: run once in Supabase → SQL Editor (setup.bat can do it for you). Safe to run again.
-- Only bot data lives here (file index, daily problems, streaks, groups). No member records beyond that.
-- RLS is on with no policies, so the website's publishable key can't read or write these tables;
-- the bot uses the service_role key, which bypasses RLS.

create table if not exists files (
  id          bigserial primary key,
  hash        text unique not null,      -- sha256 of the file (or discord:<message>:<attachment> for files already on the server)
  name        text not null,
  kind        text not null,             -- paper | notes | slides | book | other
  unit_code   text,                      -- 'EMM 305', or null for books and general files
  dest_name   text,                      -- unit post, shelf or channel name
  forum       text,                      -- forum name for unit files, e.g. 'mech-year-3'
  channel_id  text not null,             -- thread or channel the file was posted in
  message_id  text not null,
  size        bigint,
  source_path text,
  created_at  timestamptz not null default now()
);
create index if not exists files_unit_idx on files (unit_code);
create index if not exists files_created_idx on files (created_at);
create index if not exists files_size_idx on files (size);  -- duplicate check: same size and file type
create index if not exists files_message_idx on files (channel_id, message_id);

create table if not exists problems (
  id             bigserial primary key,
  day            date unique not null,   -- Nairobi date it was posted
  unit_code      text,
  source_file_id bigint references files(id) on delete set null,
  question       text not null,
  choices        jsonb not null,         -- ["...", "...", "...", "..."]
  answer         int not null,           -- index into choices
  solution       text not null,
  channel_id     text,
  message_id     text,
  revealed       boolean not null default false,
  created_at     timestamptz not null default now()
);

create table if not exists answers (
  problem_id bigint references problems(id) on delete cascade,
  user_id    text not null,
  choice     int not null,
  correct    boolean not null,
  at         timestamptz not null default now(),
  primary key (problem_id, user_id)
);

create table if not exists players (
  user_id  text primary key,
  name     text,
  points   int not null default 0,
  streak   int not null default 0,
  best     int not null default 0,
  last_day date
);

create table if not exists groups (
  id          bigserial primary key,
  kind        text not null check (kind in ('study', 'squad')),
  name        text not null,
  unit_code   text,
  owner_id    text not null,
  max_members int not null default 8,
  thread_id   text,
  created_at  timestamptz not null default now()
);

create table if not exists group_members (
  group_id  bigint references groups(id) on delete cascade,
  user_id   text not null,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- Members who chose to be findable as classmates (/classmates on).
create table if not exists findable (
  user_id      text primary key,
  name         text,
  course_roles text[] not null default '{}',
  note         text,
  at           timestamptz not null default now()
);

-- Per-member switches (/nudges off).
create table if not exists prefs (
  user_id text primary key,
  nudges  boolean not null default true
);

alter table files         enable row level security;
alter table problems      enable row level security;
alter table answers       enable row level security;
alter table players       enable row level security;
alter table groups        enable row level security;
alter table group_members enable row level security;
alter table findable      enable row level security;
alter table prefs         enable row level security;
