-- Local preparation only. Apply to Nanayé after release approval.
begin;
create table public.crm_message_drafts (
 id uuid primary key default gen_random_uuid(),
 brand_id uuid not null references public.crm_brands(id),
 contact_id uuid not null,
 subject text not null check(length(trim(subject)) between 1 and 300),
 body text not null check(length(trim(body)) between 1 and 20000),
 signature text not null check(length(signature) between 1 and 100),
 recipient text not null default '' check(length(recipient)<=320),
 version integer not null default 1,
 created_by uuid not null, updated_by uuid not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(brand_id,contact_id),
 foreign key(brand_id,contact_id) references public.crm_records(brand_id,id)
);
alter table public.crm_message_drafts enable row level security;
revoke all on public.crm_message_drafts from public,anon,authenticated;
grant select,insert,update on public.crm_message_drafts to authenticated;
create policy draft_read on public.crm_message_drafts for select to authenticated using(crm_private.can_access(brand_id));
create policy draft_insert on public.crm_message_drafts for insert to authenticated with check(crm_private.can_access(brand_id,true));
create policy draft_update on public.crm_message_drafts for update to authenticated using(crm_private.can_access(brand_id,true)) with check(crm_private.can_access(brand_id,true));
create function crm_private.message_draft_before() returns trigger language plpgsql set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 -- Lock the contact so an opt-out racing this save is checked consistently.
 perform 1 from public.crm_records where id=new.contact_id and brand_id=new.brand_id and kind='contact' and not archived and status<>'Ne plus contacter' for share;
 if not found then raise exception 'Active contact required'; end if;
 if TG_OP='UPDATE' then
  if new.id<>old.id or new.brand_id<>old.brand_id or new.contact_id<>old.contact_id then raise exception 'Draft identity is immutable'; end if;
  new.created_by=old.created_by;new.created_at=old.created_at;new.version=old.version+1;
 else new.created_by=auth.uid();new.created_at=now();new.version=1;
 end if;
 new.updated_by=auth.uid();new.updated_at=now();return new;
end; $$;
create function crm_private.message_draft_after() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not crm_private.can_access(new.brand_id,true) then raise exception 'Editor required'; end if;
 insert into public.crm_events(brand_id,record_id,actor_id,record_name,action)
 select new.brand_id,new.contact_id,auth.uid(),name,'Brouillon enregistré (aucun envoi)' from public.crm_records where id=new.contact_id and brand_id=new.brand_id;
 return new;
end; $$;
revoke all on function crm_private.message_draft_before(),crm_private.message_draft_after() from public,anon,authenticated;
create trigger message_draft_before before insert or update on public.crm_message_drafts for each row execute function crm_private.message_draft_before();
create trigger message_draft_after after insert or update on public.crm_message_drafts for each row execute function crm_private.message_draft_after();
commit;
