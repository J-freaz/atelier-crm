begin;
create table crm_private.gmail_states (
 actor_id uuid primary key references auth.users(id),
 state_hash text not null unique,
 verifier_cipher text not null,
 expires_at timestamptz not null
);
create table crm_private.gmail_connection (
 brand_id uuid primary key references public.crm_brands(id),
 email text not null check(email='commercial.nanaye@gmail.com'),
 refresh_cipher text not null,
 connected_by uuid not null references auth.users(id),
 connected_at timestamptz not null default now(),
 scopes text not null
);
alter table crm_private.gmail_states enable row level security;
alter table crm_private.gmail_connection enable row level security;
revoke all on crm_private.gmail_states,crm_private.gmail_connection from public,anon,authenticated;
-- Only the server may call this endpoint; it independently verifies the actor's membership.
create function public.crm_gmail_internal(operation text,actor uuid,payload jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare b constant uuid := 'db60e148-afb6-4870-9c8e-1c9330706f22'; r text; s crm_private.gmail_states; c crm_private.gmail_connection;
begin
 select role into r from public.crm_members where brand_id=b and user_id=actor;
 if r is null then raise exception 'Membership required'; end if;
 if operation='status' then
  select * into c from crm_private.gmail_connection where brand_id=b;
  return jsonb_build_object('connected',found,'email',c.email,'connectedAt',c.connected_at);
 end if;
 if r<>'owner' then raise exception 'Owner required'; end if;
 if operation='start' then
  if length(payload->>'stateHash')<>43 or length(payload->>'verifierCipher') not between 40 and 1000 then raise exception 'Invalid state'; end if;
  if exists(select 1 from crm_private.gmail_states where actor_id=actor and expires_at>now()+interval '9 minutes 50 seconds') then raise exception 'Please wait before retrying'; end if;
  insert into crm_private.gmail_states values(actor,payload->>'stateHash',payload->>'verifierCipher',now()+interval '10 minutes')
  on conflict(actor_id) do update set state_hash=excluded.state_hash,verifier_cipher=excluded.verifier_cipher,expires_at=excluded.expires_at;
  return '{}'::jsonb;
 elsif operation='consume' then
  delete from crm_private.gmail_states where actor_id=actor and state_hash=payload->>'stateHash' returning * into s;
  if not found or s.expires_at<=now() then return null; end if;
  return jsonb_build_object('verifierCipher',s.verifier_cipher);
 elsif operation='connect' then
  if payload->>'email'<>'commercial.nanaye@gmail.com' or length(payload->>'refreshCipher') not between 40 and 20000 then raise exception 'Invalid connection'; end if;
  insert into crm_private.gmail_connection(brand_id,email,refresh_cipher,connected_by,scopes) values(b,payload->>'email',payload->>'refreshCipher',actor,payload->>'scopes')
  on conflict(brand_id) do update set email=excluded.email,refresh_cipher=excluded.refresh_cipher,connected_by=actor,connected_at=now(),scopes=excluded.scopes;
  return jsonb_build_object('connected',true,'email',payload->>'email');
 else raise exception 'Unknown operation'; end if;
end; $$;
revoke all on function public.crm_gmail_internal(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.crm_gmail_internal(text,uuid,jsonb) to service_role;
commit;
