-- Migration: Create deduct_delivery_credits RPC for atomic delivery charges

create or replace function public.deduct_delivery_credits(
  p_workspace_id uuid,
  p_user_id uuid,
  p_action_type text,
  p_description text,
  p_metadata jsonb
) returns numeric language plpgsql security definer as $$
declare
  v_old_balance numeric;
  v_new_balance numeric;
  v_cost numeric;
begin
  -- Lock workspace row and retrieve current balance and action cost
  select current_balance, 
         case 
           when p_action_type = 'email' then email_cost
           when p_action_type = 'whatsapp' then whatsapp_cost
           else 0
         end
    into v_old_balance, v_cost
    from public.workspaces where id = p_workspace_id for update;

  if v_old_balance is null then
    raise exception 'Workspace not found';
  end if;

  if v_old_balance < v_cost then
    raise exception 'insufficient_funds: need %, have %', v_cost, v_old_balance;
  end if;

  v_new_balance := v_old_balance - v_cost;
  update public.workspaces set current_balance = v_new_balance where id = p_workspace_id;

  -- Insert ledger entry
  insert into public.ledgers (id, user_id, workspace_id, type, amount, balance_after, description, metadata, action_type)
    values (
      gen_random_uuid(),
      p_user_id,
      p_workspace_id,
      'deduction',
      -v_cost,
      v_new_balance,
      p_description,
      p_metadata,
      p_action_type
    );

  return v_new_balance;
end;
$$;
