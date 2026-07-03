-- Migration: Update start_batch_generation RPC to use workspace-configurable generation_cost

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
  v_generation_cost numeric;
  v_actual_cost  numeric;
begin
  -- Resolve workspace from the batch
  select workspace_id into v_workspace_id from public.batches where id = p_batch_id;
  if v_workspace_id is null then
    raise exception 'Batch has no workspace';
  end if;

  -- Lock the workspace row first to prevent concurrent deductions
  select current_balance, generation_cost, (select status from public.batches where id = p_batch_id)
    into v_old_balance, v_generation_cost, v_status
    from public.workspaces where id = v_workspace_id for update;

  if v_status = 'generating' then raise exception 'already_generating'; end if;
  if v_status = 'sending'    then raise exception 'currently_sending'; end if;

  -- Calculate actual cost dynamically based on workspace's generation_cost
  -- If p_cost is 0 (i.e. free generation for unapproved users), we keep it 0.
  -- Otherwise, we calculate actual cost using workspace's generation_cost.
  if p_cost = 0 then
    v_actual_cost := 0;
  else
    v_actual_cost := p_unpaid_count * v_generation_cost + p_regen_count * (v_generation_cost * 0.2);
  end if;

  if coalesce(v_old_balance, 0) < v_actual_cost then
    raise exception 'insufficient_funds: need %, have %', v_actual_cost, coalesce(v_old_balance, 0);
  end if;

  v_new_balance := v_old_balance - v_actual_cost;
  update public.workspaces set current_balance = v_new_balance where id = v_workspace_id;

  -- Mark unpaid certs as paid
  if array_length(p_unpaid_cert_ids, 1) > 0 then
    update public.certificates set is_paid = true where id = any(p_unpaid_cert_ids);
  end if;

  -- Ledger entry with action_type='generation'
  insert into public.ledgers (id, user_id, workspace_id, type, amount, balance_after, description, metadata, action_type)
    values (
      p_ledger_id::uuid,
      p_user_id,
      v_workspace_id,
      'deduction',
      -v_actual_cost,
      v_new_balance,
      'Certificate generation: ' || p_batch_name,
      jsonb_build_object(
        'batch_id', p_batch_id,
        'unpaid_count', p_unpaid_count,
        'regen_count', p_regen_count,
        'rate', v_generation_cost,
        'regen_rate', v_generation_cost * 0.2
      ),
      'generation'
    );

  update public.batches set status = 'generating' where id = p_batch_id;
end;
$$;
