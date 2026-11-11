-- One vote per IP per letter, a publication date for freshness, and the mixed floor feed.

-- Votes are now keyed by IP: a second device on the same connection changes that IP's vote.
delete from public.votes v
using public.votes newer
where v.letter_id = newer.letter_id and v.ip_hash = newer.ip_hash and v.created_at < newer.created_at;

alter table public.votes drop constraint votes_pkey;
alter table public.votes add primary key (letter_id, ip_hash);

-- When the letter first went public. Freshness counts from here, not from when it was written,
-- so a letter reviewed days late still gets its full week; marking it 'printed' doesn't reset it.
alter table public.letters add column published_at timestamptz;

update public.letters
set published_at = coalesce(reviewed_at, created_at)
where status in ('approved', 'printed');

create index letters_published_idx on public.letters (published_at desc) where status in ('approved', 'printed');

create or replace function public.letters_touch_reviewed() returns trigger
language plpgsql as $$
begin
  if new.status is distinct from old.status then
    new.reviewed_at := now();
  end if;
  if new.status in ('approved', 'printed') and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$;

drop function public.random_letters(int);

-- Letters for the cell floor: mostly this week's (favouring ones with few votes, so new letters get
-- seen), plus one of the month's best. Never older than 30 days, never ones this IP already voted
-- on, never ones the crowd buried (5+ downvotes and more down than up). Gaps are filled from the
-- rest of the month.
create function public.feed_letters(
  viewer_ip text,
  exclude_ids uuid[] default '{}',
  recent_count int default 2,
  top_count int default 1
)
returns table (id uuid, body text)
language sql volatile
set search_path = public
as $$
  with tally as (
    select l.id,
           l.body,
           l.published_at,
           coalesce(sum(v.value), 0) as score,
           count(v.value) filter (where v.value = 1) as up,
           count(v.value) filter (where v.value = -1) as down,
           count(v.value) as total
    from public.letters l
    left join public.votes v on v.letter_id = l.id
    where l.status in ('approved', 'printed')
      and l.published_at >= now() - interval '30 days'
      and l.id <> all (coalesce(exclude_ids, '{}'))
      and not exists (select 1 from public.votes mine where mine.letter_id = l.id and mine.ip_hash = viewer_ip)
    group by l.id
  ),
  visible as (
    select * from tally where not (down >= 5 and down > up)
  ),
  recent as (
    select t.id, t.body from visible t
    where t.published_at >= now() - interval '7 days'
    -- Weighted shuffle: each vote makes a letter less likely to be drawn.
    order by power(random(), 1 + t.total) desc
    limit least(greatest(recent_count, 0), 10)
  ),
  best as (
    select t.id, t.body from (
      select * from visible
      where score > 0 and visible.id not in (select recent.id from recent)
      order by score desc, up desc
      limit 10
    ) t
    order by random()
    limit least(greatest(top_count, 0), 10)
  ),
  picked as (
    select * from recent union all select * from best
  ),
  filler as (
    select t.id, t.body from visible t
    where t.id not in (select picked.id from picked)
    order by power(random(), 1 + t.total) desc
    limit greatest(least(recent_count, 10) + least(top_count, 10) - (select count(*) from picked), 0)
  )
  select f.id, f.body from (select * from picked union all select * from filler) f
  order by random();
$$;

revoke execute on function public.feed_letters(text, uuid[], int, int) from public, anon, authenticated;
grant execute on function public.feed_letters(text, uuid[], int, int) to service_role;
