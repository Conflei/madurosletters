-- The month's-best pick now favours higher scores instead of a flat draw among the top 10.
create or replace function public.feed_letters(
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
    -- Weighted shuffle: higher scores are drawn more often.
    order by power(random(), 1.0 / t.score) desc
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

