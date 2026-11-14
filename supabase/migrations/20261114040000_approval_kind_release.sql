-- A third approval kind: lifting containment. OWNER: Daylen (P3). Safe to run more than once.
--
-- kind = 'release'  an analyst asked to undo an incident's containment (unlock accounts,
--                   unfreeze agents). An approver confirms on the phone, like locking.

alter table public.approvals drop constraint if exists approvals_kind_check;
alter table public.approvals
  add constraint approvals_kind_check check (kind in ('containment', 'false_positive', 'release'));
