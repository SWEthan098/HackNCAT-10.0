-- Kairos core schema. OWNER: Daylen (P3). Only Daylen writes migrations.
-- Applies on top of the profiles migrations. Safe to run more than once.
--
-- Access model:
--   * The FastAPI backend uses the service role (bypasses RLS) and is the ONLY writer.
--   * Signed-in users may read; approvals only by the 'approver' role.
--   * public_feed is the only table anyone (anon) can read: a sanitized copy for the audience.
--   * Open sign-ups should be OFF in Supabase Auth; team accounts are created by hand.

-- ---------------------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------------------
create table if not exists public.user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('approver', 'red_team', 'analyst')),
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create or replace function public.has_role(wanted text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid()) and ur.role = wanted
  );
$$;

-- ---------------------------------------------------------------------------------------
-- Incidents and events
-- ---------------------------------------------------------------------------------------
create table if not exists public.incidents (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  title text not null,
  risk int not null default 0 check (risk between 0 and 100),
  level text not null default 'low' check (level in ('low', 'medium', 'high', 'critical')),
  status text not null default 'new'
    check (status in ('new', 'investigating', 'awaiting_approval', 'contained', 'closed', 'false_positive')),
  source text not null check (source in ('scripted', 'audience')),
  summary text,
  triage_label text,
  mitre jsonb not null default '[]'::jsonb
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  sensor text not null check (sensor in ('login_guard', 'comms_guard', 'agent_firewall')),
  actor text not null,
  target text not null,
  source text not null check (source in ('scripted', 'audience')),
  action text not null,
  risk int not null check (risk between 0 and 100),
  level text not null check (level in ('low', 'medium', 'high', 'critical')),
  verdict text not null check (verdict in ('allowed', 'flagged', 'blocked')),
  reason text not null,
  mitre jsonb not null default '[]'::jsonb,
  -- Raw login timing/metadata only (never typed content). Deleted after 24h; scores are kept.
  raw_features jsonb,
  incident_id uuid references public.incidents (id) on delete set null
);

create index if not exists events_actor_idx on public.events (actor, created_at desc);
create index if not exists events_target_idx on public.events (target, created_at desc);
create index if not exists events_incident_idx on public.events (incident_id);

-- ---------------------------------------------------------------------------------------
-- Approvals, appeals, audit log, containment state
-- ---------------------------------------------------------------------------------------
create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  incident_id uuid not null references public.incidents (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied', 'expired')),
  -- Built from code templates using event facts, never attacker text.
  summary text not null,
  actions jsonb not null default '[]'::jsonb,
  decided_by uuid references auth.users (id),
  decided_at timestamptz,
  expires_at timestamptz
);

create table if not exists public.appeals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event_id uuid references public.events (id) on delete set null,
  incident_id uuid references public.incidents (id) on delete set null,
  reason text not null check (char_length(reason) <= 1000),
  status text not null default 'open' check (status in ('open', 'accepted', 'rejected'))
);

create table if not exists public.audit_log (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  actor text not null,
  action text not null,
  detail jsonb not null default '{}'::jsonb,  -- redacted data only
  prev_hash text,
  hash text not null
);

create table if not exists public.entity_state (
  entity text primary key,                     -- e.g. 'j.smith', 'finance_agent'
  locked boolean not null default false,       -- account locked (needs human approval)
  frozen boolean not null default false,       -- agent frozen (kill switch / freeze)
  sessions_revoked_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by text
);

-- ---------------------------------------------------------------------------------------
-- Audience: attempts (/attack + Attack Picker) and the sanitized public feed
-- ---------------------------------------------------------------------------------------
create table if not exists public.attempts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  nickname text not null,
  attack_type text not null,
  message text,
  verdict text not null check (verdict in ('allowed', 'flagged', 'blocked')),
  blocked_by text,
  layers_reached int not null default 0,
  technique text,
  breach boolean not null default false,
  reason text
);

create table if not exists public.public_feed (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  nickname text not null,
  attack_type text not null,
  verdict text not null,
  layers_reached int not null default 0,
  technique text,
  summary text not null  -- filtered, no personal data
);

-- ---------------------------------------------------------------------------------------
-- updated_at maintenance (set_updated_at() comes from the profiles hardening migration)
-- ---------------------------------------------------------------------------------------
drop trigger if exists incidents_set_updated_at on public.incidents;
create trigger incidents_set_updated_at
  before update on public.incidents
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------------------
alter table public.user_roles enable row level security;
alter table public.incidents enable row level security;
alter table public.events enable row level security;
alter table public.approvals enable row level security;
alter table public.appeals enable row level security;
alter table public.audit_log enable row level security;
alter table public.entity_state enable row level security;
alter table public.attempts enable row level security;
alter table public.public_feed enable row level security;

-- Clients never write directly; the backend (service role) does all writes.
revoke all on public.user_roles, public.incidents, public.events, public.approvals, public.appeals,
  public.audit_log, public.entity_state, public.attempts, public.public_feed from anon;
revoke insert, update, delete, truncate on public.user_roles, public.incidents, public.events,
  public.approvals, public.appeals, public.audit_log, public.entity_state, public.attempts,
  public.public_feed from authenticated;
grant select on public.user_roles, public.incidents, public.events, public.approvals, public.appeals,
  public.audit_log, public.entity_state, public.attempts, public.public_feed to authenticated;
grant select on public.public_feed to anon;

drop policy if exists "Users read their own roles" on public.user_roles;
create policy "Users read their own roles" on public.user_roles
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Signed-in users read incidents" on public.incidents;
create policy "Signed-in users read incidents" on public.incidents
  for select to authenticated using (true);

drop policy if exists "Signed-in users read events" on public.events;
create policy "Signed-in users read events" on public.events
  for select to authenticated using (true);

drop policy if exists "Approvers read approvals" on public.approvals;
create policy "Approvers read approvals" on public.approvals
  for select to authenticated using (public.has_role('approver'));

drop policy if exists "Signed-in users read appeals" on public.appeals;
create policy "Signed-in users read appeals" on public.appeals
  for select to authenticated using (true);

drop policy if exists "Signed-in users read audit log" on public.audit_log;
create policy "Signed-in users read audit log" on public.audit_log
  for select to authenticated using (true);

drop policy if exists "Signed-in users read entity state" on public.entity_state;
create policy "Signed-in users read entity state" on public.entity_state
  for select to authenticated using (true);

drop policy if exists "Signed-in users read attempts" on public.attempts;
create policy "Signed-in users read attempts" on public.attempts
  for select to authenticated using (true);

drop policy if exists "Anyone reads the public feed" on public.public_feed;
create policy "Anyone reads the public feed" on public.public_feed
  for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------------------------
-- Realtime (live console, phone approvals, audience counter)
-- ---------------------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['events', 'incidents', 'approvals', 'public_feed', 'attempts'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;
