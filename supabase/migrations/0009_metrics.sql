-- Milestone M7: a live count for the stop list (PRD 2.5, item 2): citations in scores that point to nothing.
create or replace function public.count_missing_citations()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.criterion_scores s, unnest(s.evidence_refs) r
  where not exists (select 1 from public.evidence e where e.id = r);
$$;
revoke all on function public.count_missing_citations() from public, anon, authenticated;
