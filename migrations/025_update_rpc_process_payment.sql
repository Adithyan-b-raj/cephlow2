-- Migration: Update process_payment RPC to credit workspaces in credits and log original rupee amount

create or replace function public.process_payment(
  p_user_id        uuid,
  p_amount         numeric, -- Rupee amount
  p_credits        numeric, -- Calculated credits
  p_order_id       text,
  p_payment_id     text,
  p_payment_method text
) returns jsonb language plpgsql security definer as $$
declare
  v_workspace_id uuid;
  v_old_balance  numeric;
  v_new_balance  numeric;
begin
  -- Resolve workspace (matches Cashfree controller behavior, personal or default workspace)
  select workspace_id into v_workspace_id
    from public.workspace_members
    where user_id = p_user_id and role = 'owner'
    order by joined_at
    limit 1;

  if v_workspace_id is null then
    -- Fallback: any workspace they belong to
    select workspace_id into v_workspace_id
      from public.workspace_members
      where user_id = p_user_id
      order by joined_at
      limit 1;
  end if;

  if v_workspace_id is null then
    raise exception 'No workspace found for user %', p_user_id;
  end if;

  -- Lock the workspace row first to prevent concurrent updates
  select current_balance into v_old_balance from public.workspaces where id = v_workspace_id for update;
  v_new_balance := coalesce(v_old_balance, 0) + p_credits;

  update public.workspaces set current_balance = v_new_balance where id = v_workspace_id;

  -- Log in ledger: store p_credits in amount and balance_after, and original rupees in metadata
  insert into public.ledgers (id, user_id, workspace_id, type, amount, balance_after, description, metadata)
    values (
      gen_random_uuid(), p_user_id, v_workspace_id, 'topup', p_credits, v_new_balance,
      'Top-up: Rs.' || p_amount || ' (' || p_credits || ' credits)',
      jsonb_build_object(
        'order_id', p_order_id,
        'payment_id', p_payment_id,
        'payment_method', p_payment_method,
        'rupee_amount', p_amount
      )
    );

  update public.payment_orders set processed = true where order_id = p_order_id;

  return jsonb_build_object('status', 'ok', 'new_balance', v_new_balance);
end;
$$;
