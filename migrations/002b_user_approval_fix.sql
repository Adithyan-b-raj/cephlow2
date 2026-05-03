-- Repairs `public.user_profiles` if the previous migration's
-- `create table if not exists` was skipped because the table already
-- existed without the approval columns.
--
-- Safe to re-run.

alter table public.user_profiles
  add column if not exists is_approved boolean not null default false;

alter table public.user_profiles
  add column if not exists email text;

alter table public.user_profiles
  add column if not exists approval_requested_at timestamptz;

alter table public.user_profiles
  add column if not exists approved_at timestamptz;

alter table public.user_profiles
  add column if not exists approved_by text;

alter table public.user_profiles
  add column if not exists notes text;

alter table public.user_profiles
  add column if not exists created_at timestamptz not null default now();

alter table public.user_profiles
  add column if not exists updated_at timestamptz not null default now();

create index if not exists user_profiles_is_approved_idx
  on public.user_profiles (is_approved);

alter table public.user_profiles enable row level security;

drop policy if exists "service-role-all" on public.user_profiles;
create policy "service-role-all"
  on public.user_profiles
  for all
  to service_role
  using (true)
  with check (true);

create or replace function public.touch_user_profiles_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_profiles_touch_updated_at on public.user_profiles;
create trigger user_profiles_touch_updated_at
  before update on public.user_profiles
  for each row execute function public.touch_user_profiles_updated_at();

create or replace function public.approve_user_by_email(p_email text, p_approver text)
returns void language plpgsql security definer as $$
declare
  v_user_id uuid;
begin
  select id into v_user_id from auth.users where email = p_email limit 1;
  if v_user_id is null then
    raise exception 'No user found with email %', p_email;
  end if;

  insert into public.user_profiles(user_id, email, is_approved, approved_at, approved_by)
  values (v_user_id, p_email, true, now(), p_approver)
  on conflict (user_id) do update
    set is_approved = true,
        approved_at = now(),
        approved_by = p_approver,
        email = excluded.email;
end;
$$;
