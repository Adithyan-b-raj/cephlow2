-- Fix the approve_user_by_email helper to use the existing `id` column
-- (your user_profiles is keyed on id = auth.users.id, not user_id).
-- Safe to re-run.

create or replace function public.approve_user_by_email(p_email text, p_approver text)
returns void language plpgsql security definer as $$
declare
  v_user_id uuid;
begin
  select id into v_user_id from auth.users where email = p_email limit 1;
  if v_user_id is null then
    raise exception 'No user found with email %', p_email;
  end if;

  insert into public.user_profiles(id, email, is_approved, approved_at, approved_by)
  values (v_user_id, p_email, true, now(), p_approver)
  on conflict (id) do update
    set is_approved = true,
        approved_at = now(),
        approved_by = p_approver,
        email = excluded.email;
end;
$$;
