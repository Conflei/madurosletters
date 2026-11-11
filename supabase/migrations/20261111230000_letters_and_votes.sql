-- Letters written by players and weekly votes on them.
-- Nothing here is reachable with the public keys: RLS is on with no policies, and all reads and
-- writes go through the `api` Edge Function using the service role.

create type public.letter_status as enum ('pending', 'approved', 'rejected', 'printed');

create table public.letters (
  id uuid primary key default gen_random_uuid(),
  body text not null check (char_length(body) between 5 and 280),
  -- Set by hand in the dashboard: only 'approved' and 'printed' letters are ever shown to players.
  status public.letter_status not null default 'pending',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  notes text,
  -- Anti-abuse metadata, never returned to clients.
  body_hash text not null,
  device_id uuid not null,
  ip_hash text not null,
  user_agent text
);

comment on column public.letters.status is 'pending → approved / rejected by hand; printed once mailed.';

create index letters_status_idx on public.letters (status, created_at desc);
create index letters_ip_recent_idx on public.letters (ip_hash, created_at desc);
create index letters_device_recent_idx on public.letters (device_id, created_at desc);
create index letters_body_hash_idx on public.letters (body_hash, created_at desc);

-- Stamp reviewed_at whenever the status is changed by hand.
create function public.letters_touch_reviewed() returns trigger
language plpgsql as $$
begin
  if new.status is distinct from old.status then
    new.reviewed_at := now();
  end if;
  return new;
end;
$$;

create trigger letters_touch_reviewed
before update of status on public.letters
for each row execute function public.letters_touch_reviewed();

create table public.votes (
  letter_id uuid not null references public.letters (id) on delete cascade,
  device_id uuid not null,
  ip_hash text not null,
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  primary key (letter_id, device_id)
);

create index votes_recent_idx on public.votes (created_at desc);
create index votes_ip_recent_idx on public.votes (ip_hash, created_at desc);

alter table public.letters enable row level security;
alter table public.votes enable row level security;

revoke all on public.letters from anon, authenticated;
revoke all on public.votes from anon, authenticated;

-- Most-voted approved letters, counting only votes cast in the last 7 days.
create function public.top_letters_week(max_results int default 10)
returns table (id uuid, body text, score int, upvotes int, downvotes int)
language sql stable
set search_path = public
as $$
  select l.id,
         l.body,
         sum(v.value)::int as score,
         (count(*) filter (where v.value = 1))::int as upvotes,
         (count(*) filter (where v.value = -1))::int as downvotes
  from public.letters l
  join public.votes v on v.letter_id = l.id and v.created_at >= now() - interval '7 days'
  where l.status in ('approved', 'printed')
  group by l.id
  having sum(v.value) > 0
  order by score desc, upvotes desc, l.created_at desc
  limit least(greatest(max_results, 1), 50);
$$;

-- A random handful of approved letters to scatter on the cell floor.
create function public.random_letters(max_results int default 10)
returns table (id uuid, body text)
language sql volatile
set search_path = public
as $$
  select l.id, l.body
  from public.letters l
  where l.status in ('approved', 'printed')
  order by random()
  limit least(greatest(max_results, 1), 30);
$$;

revoke execute on function public.top_letters_week(int) from public, anon, authenticated;
revoke execute on function public.random_letters(int) from public, anon, authenticated;
grant execute on function public.top_letters_week(int) to service_role;
grant execute on function public.random_letters(int) to service_role;
