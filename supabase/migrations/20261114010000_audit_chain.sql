-- Kairos audit hash chain. OWNER: Daylen (P3). Safe to run more than once.
--
-- Every audit_log row stores the hash of the previous row, so editing or deleting any row
-- breaks the chain. Appends go through audit_append(), which takes a lock so two requests
-- arriving together cannot both claim the same "previous" row. The backend (service role)
-- is the only caller; anon and signed-in users cannot run these functions.

-- The one definition of "what gets hashed". Used by both append and verify.
create or replace function public.audit_hash(
  p_prev text, p_id bigint, p_created_at timestamptz, p_actor text, p_action text, p_detail jsonb
)
returns text
language sql
stable
set search_path = ''
as $$
  select encode(
    sha256(
      convert_to(
        jsonb_build_array(
          coalesce(p_prev, ''),
          p_id,
          to_char(p_created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
          p_actor,
          p_action,
          p_detail
        )::text,
        'UTF8'
      )
    ),
    'hex'
  );
$$;

create or replace function public.audit_append(p_actor text, p_action text, p_detail jsonb default '{}'::jsonb)
returns public.audit_log
language plpgsql
set search_path = ''
as $$
declare
  v_prev text;
  v_id bigint;
  v_at timestamptz := clock_timestamp();
  v_detail jsonb := coalesce(p_detail, '{}'::jsonb);
  v_row public.audit_log;
begin
  -- One writer at a time, released when this transaction ends.
  perform pg_advisory_xact_lock(hashtext('kairos.audit_log'));
  select a.hash into v_prev from public.audit_log a order by a.id desc limit 1;
  v_id := nextval(pg_get_serial_sequence('public.audit_log', 'id'));
  insert into public.audit_log (id, created_at, actor, action, detail, prev_hash, hash)
  values (
    v_id, v_at, p_actor, p_action, v_detail, v_prev,
    public.audit_hash(v_prev, v_id, v_at, p_actor, p_action, v_detail)
  )
  returning * into v_row;
  return v_row;
end;
$$;

-- Walks the chain in id order. first_bad_id is the first row whose stored hash, or whose link
-- to the row before it, does not match. NULL means the chain is intact.
create or replace function public.audit_verify()
returns table (ok boolean, entries_checked bigint, first_bad_id bigint)
language sql
stable
set search_path = ''
as $$
  with chain as (
    select
      a.id,
      a.hash,
      a.prev_hash,
      lag(a.hash) over (order by a.id) as expected_prev,
      public.audit_hash(a.prev_hash, a.id, a.created_at, a.actor, a.action, a.detail) as expected_hash
    from public.audit_log a
  ),
  bad as (
    select min(c.id) as id
    from chain c
    where c.hash is distinct from c.expected_hash
       or c.prev_hash is distinct from c.expected_prev
  )
  select
    (select b.id from bad b) is null,
    (select count(*) from chain),
    (select b.id from bad b);
$$;

revoke all on function public.audit_hash(text, bigint, timestamptz, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.audit_append(text, text, jsonb) from public, anon, authenticated;
revoke all on function public.audit_verify() from public, anon, authenticated;
grant execute on function public.audit_hash(text, bigint, timestamptz, text, text, jsonb) to service_role;
grant execute on function public.audit_append(text, text, jsonb) to service_role;
grant execute on function public.audit_verify() to service_role;
