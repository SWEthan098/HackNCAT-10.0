-- Approvals get a kind and a requester. OWNER: Daylen (P3). Safe to run more than once.
--
-- kind = 'containment'    lock / revoke / freeze (every approval so far)
-- kind = 'false_positive' an analyst asked to dismiss a High or Critical incident; an approver
--                         must confirm it, and it can't be the same person who asked.
-- requested_by records who asked ('engine:correlation', 'user:<uuid>', ...), so the API can
-- refuse a self-approval. Existing rows become containment requests with no recorded requester.

alter table public.approvals
  add column if not exists kind text not null default 'containment',
  add column if not exists requested_by text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'approvals_kind_check') then
    alter table public.approvals
      add constraint approvals_kind_check check (kind in ('containment', 'false_positive'));
  end if;
end $$;
