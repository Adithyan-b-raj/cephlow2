-- Workspaces & sub-accounts
-- Run against Supabase project after 001_builtin_templates.sql.

-- 1. Workspaces
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  current_balance numeric not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists workspaces_owner_id_idx on public.workspaces (owner_id);

-- 2. Membership
create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','member')),
  joined_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index if not exists workspace_members_user_idx
  on public.workspace_members (user_id);

-- 3. Pending invites
create table if not exists public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin','member')),
  token text not null unique,
  invited_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists workspace_invites_workspace_idx
  on public.workspace_invites (workspace_id);
create index if not exists workspace_invites_email_idx
  on public.workspace_invites (email);

-- 4. Brand kit (1:1 with workspace)
create table if not exists public.workspace_brands (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  logo_url text,
  primary_color text,
  secondary_color text,
  font_family text,
  updated_at timestamptz not null default now()
);

-- 5. Add workspace_id to existing domain tables (nullable for backfill)
alter table public.batches
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

alter table public.builtin_templates
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

alter table public.ledgers
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

-- 6. Backfill: create one "Personal" workspace per existing user, copy balance,
--    and stamp workspace_id on owned rows.
do $$
declare
  rec record;
  ws_id uuid;
  bal numeric;
begin
  for rec in
    select distinct u.id, u.email
    from auth.users u
  loop
    -- Skip users that already own a workspace (idempotent re-runs).
    select id into ws_id from public.workspaces where owner_id = rec.id limit 1;
    if ws_id is not null then
      continue;
    end if;

    select coalesce(current_balance, 0) into bal
      from public.user_profiles where id = rec.id;
    if bal is null then bal := 0; end if;

    insert into public.workspaces (name, owner_id, current_balance)
      values ('Personal', rec.id, bal)
      returning id into ws_id;

    insert into public.workspace_members (workspace_id, user_id, role)
      values (ws_id, rec.id, 'owner')
      on conflict do nothing;

    update public.batches
      set workspace_id = ws_id
      where user_id = rec.id and workspace_id is null;

    update public.builtin_templates
      set workspace_id = ws_id
      where user_id = rec.id and workspace_id is null;

    update public.ledgers
      set workspace_id = ws_id
      where user_id = rec.id and workspace_id is null;
  end loop;
end $$;

-- 7. Lock workspace_id NOT NULL once backfilled
alter table public.batches alter column workspace_id set not null;
alter table public.builtin_templates alter column workspace_id set not null;
alter table public.ledgers alter column workspace_id set not null;

create index if not exists batches_workspace_idx on public.batches (workspace_id);
create index if not exists builtin_templates_workspace_idx
  on public.builtin_templates (workspace_id);
create index if not exists ledgers_workspace_idx on public.ledgers (workspace_id);

-- 8. RLS: service-role-only on all new tables (matches 001 pattern)
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_invites enable row level security;
alter table public.workspace_brands enable row level security;

drop policy if exists "service-role-all" on public.workspaces;
create policy "service-role-all" on public.workspaces
  for all to service_role using (true) with check (true);

drop policy if exists "service-role-all" on public.workspace_members;
create policy "service-role-all" on public.workspace_members
  for all to service_role using (true) with check (true);

drop policy if exists "service-role-all" on public.workspace_invites;
create policy "service-role-all" on public.workspace_invites
  for all to service_role using (true) with check (true);

drop policy if exists "service-role-all" on public.workspace_brands;
create policy "service-role-all" on public.workspace_brands
  for all to service_role using (true) with check (true);

-- 9. Auto-touch workspace_brands.updated_at
create or replace function public.touch_workspace_brands_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists workspace_brands_touch_updated_at on public.workspace_brands;
create trigger workspace_brands_touch_updated_at
  before update on public.workspace_brands
  for each row execute function public.touch_workspace_brands_updated_at();

-- 10. payment_orders: maps Cashfree order_id → workspace so webhook can credit the right wallet
create table if not exists public.payment_orders (
  order_id    text primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  amount      numeric not null,
  processed   boolean not null default false,
  created_at  timestamptz not null default now()
);

alter table public.payment_orders enable row level security;
drop policy if exists "service-role-all" on public.payment_orders;
create policy "service-role-all" on public.payment_orders
  for all to service_role using (true) with check (true);

-- 11. Replace process_payment RPC to credit workspaces.current_balance
--     Old signature: p_user_id, p_order_id, p_amount, p_payment_id, p_payment_method
--     Same signature kept for backward-compat; workspace resolved from payment_orders.
create or replace function public.process_payment(
  p_user_id      uuid,
  p_order_id     text,
  p_amount       numeric,
  p_payment_id   text default null,
  p_payment_method text default null
) returns jsonb language plpgsql security definer as $$
declare
  v_workspace_id uuid;
  v_old_balance  numeric;
  v_new_balance  numeric;
begin
  -- Idempotency check
  if (select processed from public.payment_orders where order_id = p_order_id) then
    return jsonb_build_object('status', 'already_processed');
  end if;

  -- Resolve workspace from the stored order
  select workspace_id into v_workspace_id
    from public.payment_orders
    where order_id = p_order_id;

  if v_workspace_id is null then
    -- Fallback: use the owner's personal workspace (legacy path)
    select id into v_workspace_id
      from public.workspaces
      where owner_id = p_user_id
      order by created_at
      limit 1;
  end if;

  if v_workspace_id is null then
    raise exception 'No workspace found for user %', p_user_id;
  end if;

  select current_balance into v_old_balance from public.workspaces where id = v_workspace_id for update;
  v_new_balance := coalesce(v_old_balance, 0) + p_amount;

  update public.workspaces set current_balance = v_new_balance where id = v_workspace_id;

  insert into public.ledgers (user_id, workspace_id, type, amount, balance_after, description, metadata)
    values (
      p_user_id, v_workspace_id, 'topup', p_amount, v_new_balance,
      'Top-up via Cashfree',
      jsonb_build_object(
        'order_id', p_order_id,
        'payment_id', p_payment_id,
        'payment_method', p_payment_method
      )
    );

  update public.payment_orders set processed = true where order_id = p_order_id;

  return jsonb_build_object('status', 'ok', 'new_balance', v_new_balance);
end;
$$;

-- 12. Replace start_batch_generation RPC to deduct from workspaces.current_balance
create or replace function public.start_batch_generation(
  p_user_id        uuid,
  p_batch_id       uuid,
  p_cost           numeric,
  p_unpaid_cert_ids uuid[],
  p_ledger_id      text,
  p_batch_name     text,
  p_unpaid_count   int,
  p_regen_count    int,
  p_rate           numeric,
  p_regen_rate     numeric
) returns void language plpgsql security definer as $$
declare
  v_workspace_id uuid;
  v_old_balance  numeric;
  v_new_balance  numeric;
  v_status       text;
begin
  -- Resolve workspace from the batch
  select workspace_id into v_workspace_id from public.batches where id = p_batch_id;
  if v_workspace_id is null then
    raise exception 'Batch has no workspace';
  end if;

  -- Lock the workspace row first to prevent concurrent deductions
  select current_balance, (select status from public.batches where id = p_batch_id)
    into v_old_balance, v_status
    from public.workspaces where id = v_workspace_id for update;

  if v_status = 'generating' then raise exception 'already_generating'; end if;
  if v_status = 'sending'    then raise exception 'currently_sending'; end if;

  if coalesce(v_old_balance, 0) < p_cost then
    raise exception 'insufficient_funds: need %, have %', p_cost, coalesce(v_old_balance, 0);
  end if;

  v_new_balance := v_old_balance - p_cost;
  update public.workspaces set current_balance = v_new_balance where id = v_workspace_id;

  -- Mark unpaid certs as paid
  if array_length(p_unpaid_cert_ids, 1) > 0 then
    update public.certificates set is_paid = true where id = any(p_unpaid_cert_ids);
  end if;

  -- Ledger entry
  insert into public.ledgers (id, user_id, workspace_id, type, amount, balance_after, description, metadata)
    values (
      p_ledger_id::uuid,
      p_user_id,
      v_workspace_id,
      'deduction',
      -p_cost,
      v_new_balance,
      'Certificate generation: ' || p_batch_name,
      jsonb_build_object(
        'batch_id', p_batch_id,
        'unpaid_count', p_unpaid_count,
        'regen_count', p_regen_count,
        'rate', p_rate,
        'regen_rate', p_regen_rate
      )
    );

  update public.batches set status = 'generating' where id = p_batch_id;
end;
$$;

-- 13. increment_batch_column helper (unchanged — no wallet involvement)
create or replace function public.increment_batch_column(
  p_batch_id uuid,
  p_column   text,
  p_amount   int default 1
) returns void language plpgsql security definer as $$
begin
  if p_column = 'generated_count' then
    update public.batches set generated_count = generated_count + p_amount where id = p_batch_id;
  elsif p_column = 'sent_count' then
    update public.batches set sent_count = sent_count + p_amount where id = p_batch_id;
  elsif p_column = 'failed_count' then
    update public.batches set failed_count = coalesce(failed_count, 0) + p_amount where id = p_batch_id;
  end if;
end;
$$;
