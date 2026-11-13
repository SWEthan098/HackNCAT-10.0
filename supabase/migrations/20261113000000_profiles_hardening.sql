-- Harden the profiles table created in 20261112000000_create_profiles.sql.
-- Safe to run more than once: every statement is idempotent.
--
-- 1. Signup trigger no longer fails if a profile already exists (on conflict do nothing).
-- 2. Backfill a profile for any existing auth user that is missing one.
-- 3. updated_at is maintained by the database on every update.
-- 4. Basic data constraints on user-editable columns.
-- 5. Explicit grants: clients may read/update their own row (RLS), never insert or delete.

-- 1. Idempotent profile creation on signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. Backfill users created before the trigger existed (or while it was failing).
insert into public.profiles (id)
select u.id from auth.users u
on conflict (id) do nothing;

-- 3. Reusable updated_at trigger function for this and future tables.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- 4. Constraints (added only if missing).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_display_name_length') then
    alter table public.profiles
      add constraint profiles_display_name_length check (display_name is null or char_length(display_name) <= 80);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_avatar_url_https') then
    alter table public.profiles
      add constraint profiles_avatar_url_https check (avatar_url is null or avatar_url like 'https://%');
  end if;
end;
$$;

-- 5. Least-privilege grants. RLS policies (select/update own row) still apply on top.
-- Supabase grants ALL to anon/authenticated by default; a table-level UPDATE grant would
-- override the column list below, so revoke it first. service_role is unaffected.
revoke all on public.profiles from anon;
revoke insert, update, delete, truncate on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;
