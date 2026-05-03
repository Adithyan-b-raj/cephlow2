-- User approval tier
-- Run this against your Supabase project (SQL editor or psql).
--
-- Two-tier model:
--   • is_approved=false (default): "free / unapproved" — can log in,
--     generate certificates to their own Google Drive, use the builtin
--     editor, send by email and download CSV. Locked: WhatsApp, QR codes,
--     Google Slides templates, R2 storage, public profiles, wallet passes.
--   • is_approved=true: full access (current product behaviour).
--
-- Approval is granted manually by flipping `is_approved=true` in this
-- table from the Supabase SQL editor.

create table if not exists public.user_profiles (
  user_id uuid primary key,
  email text,
  is_approved boolean not null default false,
  approval_requested_at timestamptz,
  approved_at timestamptz,
  approved_by text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

-- Touch updated_at on every change
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

-- Convenience: set the approval flag for a user by email (admin tool)
-- Example:
--   select public.approve_user_by_email('user@example.com', 'admin@cephlow.online');
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
