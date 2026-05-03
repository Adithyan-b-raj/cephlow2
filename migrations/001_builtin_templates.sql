-- Builtin Template Editor schema
-- Run this against your Supabase project (via SQL editor or psql).

-- 1. Table for templates designed inside Cephloe
create table if not exists public.builtin_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  canvas jsonb not null,
  placeholders text[] not null default '{}',
  thumbnail_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists builtin_templates_user_id_idx
  on public.builtin_templates (user_id);

create index if not exists builtin_templates_user_updated_idx
  on public.builtin_templates (user_id, updated_at desc);

alter table public.builtin_templates enable row level security;

-- Service-role-only access (the API server uses the service role key);
-- end users never hit this table directly with their own JWT.
drop policy if exists "service-role-all" on public.builtin_templates;
create policy "service-role-all"
  on public.builtin_templates
  for all
  to service_role
  using (true)
  with check (true);

-- 2. template_kind column on batches: 'slides' (legacy / Google Slides) or 'builtin'
alter table public.batches
  add column if not exists template_kind text not null default 'slides';

-- Optional: backfill any existing rows defensively
update public.batches set template_kind = 'slides' where template_kind is null;

-- Index helps the dashboard count builtin vs slides batches
create index if not exists batches_template_kind_idx
  on public.batches (user_id, template_kind);

-- 3. Auto-touch updated_at on update
create or replace function public.touch_builtin_templates_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists builtin_templates_touch_updated_at on public.builtin_templates;
create trigger builtin_templates_touch_updated_at
  before update on public.builtin_templates
  for each row execute function public.touch_builtin_templates_updated_at();
