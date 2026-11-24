-- Run once in the Supabase SQL editor for this application.
-- An attempt is private to its Supabase Auth user, including anonymous users.
create table public.exam_attempts (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz,
  finished boolean not null default false,
  snapshot jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  constraint exam_attempt_snapshot_object check (jsonb_typeof(snapshot) = 'object'),
  constraint exam_attempt_snapshot_size check (octet_length(snapshot::text) <= 1048576),
  constraint exam_attempt_finish_consistency check (finished = (ended_at is not null)),
  constraint exam_attempt_time_order check (ended_at is null or ended_at >= started_at)
);

create index exam_attempts_user_started_idx on public.exam_attempts (user_id, started_at desc);

create function public.set_exam_attempt_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger exam_attempts_updated_at before update on public.exam_attempts
for each row execute function public.set_exam_attempt_updated_at();

alter table public.exam_attempts enable row level security;
revoke all on public.exam_attempts from anon, authenticated;
grant select, insert, update, delete on public.exam_attempts to authenticated;

create policy "Read own exam attempts" on public.exam_attempts
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Create own exam attempts" on public.exam_attempts
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Update own exam attempts" on public.exam_attempts
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Delete own exam attempts" on public.exam_attempts
  for delete to authenticated using ((select auth.uid()) = user_id);
