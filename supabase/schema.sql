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

-- Community bot memory (what's been posted, today's trivia), written by community/scheduler.js.
create table if not exists community_state (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
alter table community_state enable row level security;

-- Study Hub Milestones (/log, /milestone, the public /board page). One row per log; members are whoever has logged.
create table if not exists log_members (
  user_id    text primary key,           -- Discord user id
  name       text not null,              -- server nickname or display name at their last /log
  avatar     text,                       -- Discord avatar hash, for the board page
  goal       text,                       -- /goal
  joined     date not null,
  updated_at timestamptz not null default now()
);
create table if not exists log_entries (
  id         bigserial primary key,
  user_id    text not null references log_members(user_id) on delete cascade,
  day        date not null,              -- Nairobi date the work was done
  track      text not null,              -- ai | sw | eng | iot | biz | cn | other (lib/milestones.js)
  what       text not null,
  minutes    int not null default 0,
  link       text,
  created_at timestamptz not null default now()
);
create index if not exists log_entries_user_day_idx on log_entries (user_id, day);
create index if not exists log_entries_day_idx on log_entries (day);
create table if not exists log_milestones (
  user_id      text not null references log_members(user_id) on delete cascade,
  milestone_id text not null,            -- 'ai1'... from lib/milestones.js, or 'own:<slug>' for /milestone own
  title        text not null,
  track        text not null,
  day          date not null,
  primary key (user_id, milestone_id)
);
alter table log_members    enable row level security;
alter table log_entries    enable row level security;
alter table log_milestones enable row level security;

-- Members' own interests for /log (anything outside the preset tracks), and the track name each log was made under.
create table if not exists log_tracks (
  user_id text not null references log_members(user_id) on delete cascade,
  id      text not null,                 -- 'own:<slug>'
  name    text not null,
  primary key (user_id, id)
);
alter table log_tracks enable row level security;
alter table log_entries add column if not exists track_name text;

-- Study Desk for friends (api/study.js, the "gateway"). Friends install Study Desk on their own laptops; the gateway
-- holds every secret (bot token, Supabase key, the owner's AI key) and friends sign in with a personal token.
-- Only codes' and tokens' sha256 are stored. RLS on with no policies: only the service key (Vercel, PC bot) reads them.
create table if not exists study_friends (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  via         text not null default 'invite',   -- 'invite' (a code from the owner) or 'premium' (/study link)
  invite_hash text unique,                      -- the one-time link code, until it's used
  token_hash  text unique,                      -- the device token Study Desk keeps after linking
  discord_id  text unique,                      -- set by /study connect (or /study link for Premium)
  pair_code   text,                             -- the 6-digit code shown in Study Desk for /study connect
  pair_until  timestamptz,
  ai_daily_cap int not null default 40,         -- AI actions a day on the owner's key ("use the Study Hub's AI")
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  linked_at   timestamptz,
  last_seen   timestamptz                        -- when its Study Desk last asked for /study commands
);
alter table study_friends add column if not exists last_seen timestamptz;
create table if not exists study_usage (
  friend_id uuid not null references study_friends(id) on delete cascade,
  day       date not null,
  ai_calls  int not null default 0,
  ai_tokens int not null default 0,
  dms       int not null default 0,
  primary key (friend_id, day)
);
-- /study commands waiting for the friend's Study Desk to answer them (it asks every few seconds while it runs)
create table if not exists study_inbox (
  id                bigint generated always as identity primary key,
  friend_id         uuid not null references study_friends(id) on delete cascade,
  command           text not null,
  args              jsonb not null default '{}',
  interaction_token text,
  status            text not null default 'new',  -- new, taken, done
  created_at        timestamptz not null default now()
);
create index if not exists study_inbox_friend_idx on study_inbox (friend_id, status);
alter table study_friends enable row level security;
alter table study_usage   enable row level security;
alter table study_inbox   enable row level security;

-- Counts one AI call (or DM) for a friend today and returns the day's total, in one atomic step.
create or replace function study_count(f uuid, d date, what text, tokens int default 0) returns int
language plpgsql as $$
declare n int;
begin
  insert into study_usage (friend_id, day) values (f, d) on conflict do nothing;
  if what = 'dm' then
    update study_usage set dms = dms + 1 where friend_id = f and day = d returning dms into n;
  else
    update study_usage set ai_calls = ai_calls + 1, ai_tokens = ai_tokens + tokens where friend_id = f and day = d returning ai_calls into n;
  end if;
  return n;
end $$;
