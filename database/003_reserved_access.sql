create table crm_private.reserved_access (
 id uuid primary key default gen_random_uuid(),
 email text not null check(email=lower(trim(email))),
 brand_id uuid not null references public.crm_brands(id),
 display_name text not null,
 role text not null check(role in ('owner','editor','viewer')),
 claimed_by uuid references auth.users(id),
 expires_at timestamptz not null default now()+interval '30 days',
 unique(email,brand_id)
);
alter table crm_private.reserved_access enable row level security;
revoke all on crm_private.reserved_access from public,anon,authenticated;
create function crm_private.claim_access() returns integer language plpgsql security definer set search_path='' as $$
declare verified_email text; access_row record; claimed_count integer:=0;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select lower(email) into verified_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if verified_email is null then return 0; end if;
 for access_row in select * from crm_private.reserved_access where email=verified_email and claimed_by is null and expires_at>now() for update loop
   insert into public.crm_members(brand_id,user_id,display_name,role) values(access_row.brand_id,auth.uid(),access_row.display_name,access_row.role) on conflict(brand_id,user_id) do nothing;
   update crm_private.reserved_access set claimed_by=auth.uid() where id=access_row.id;
   claimed_count:=claimed_count+1;
 end loop;
 return claimed_count;
end; $$;
revoke all on function crm_private.claim_access() from public,anon;
grant execute on function crm_private.claim_access() to authenticated;
create function public.crm_claim_access() returns integer language sql security invoker set search_path='' as $$ select crm_private.claim_access(); $$;
revoke all on function public.crm_claim_access() from public,anon;
grant execute on function public.crm_claim_access() to authenticated;
