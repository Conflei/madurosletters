-- The podium ranks letters by votes cast in the last 24 hours instead of the last 7 days:
-- there are enough new letters each day that a weekly board went stale.
create function public.top_letters_day(max_results int default 10)
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
  join public.votes v on v.letter_id = l.id and v.created_at >= now() - interval '24 hours'
  where l.status in ('approved', 'printed')
  group by l.id
  having sum(v.value) > 0
  order by score desc, upvotes desc, l.created_at desc
  limit least(greatest(max_results, 1), 50);
$$;

revoke execute on function public.top_letters_day(int) from public, anon, authenticated;
grant execute on function public.top_letters_day(int) to service_role;
