-- Public counter needs a real breach flag. OWNER: Daylen (P3). Safe to run more than once.
--
-- Before this, public_feed had no breach column, so the /attack counter guessed breaches from
-- layers_reached and showed breaches that never happened. publish_attempt() now copies the
-- same breach value it stores on attempts. Existing rows default to false (all attempts so far
-- had breach = false).

alter table public.public_feed
  add column if not exists breach boolean not null default false;
