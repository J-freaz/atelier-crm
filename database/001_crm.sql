-- Apply to a NEW dedicated Supabase project, after owner approval.
begin;
create schema if not exists crm_private;
revoke all on schema crm_private from public, anon;
grant usage on schema crm_private to authenticated;
create table public.crm_brands(id uuid primary key default gen_random_uuid(),name text not null check(length(trim(name)) between 1 and 100),created_at timestamptz not null default now());
create table public.crm_members(id uuid primary key default gen_random_uuid(),brand_id uuid not null references public.crm_brands(id),user_id uuid not null references auth.users(id),display_name text not null check(length(display_name) between 1 and 100),role text not null check(role in ('owner','editor','viewer')),unique(brand_id,user_id));
create or replace function crm_private.can_access(b uuid,write_access boolean default false) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.crm_members where brand_id=b and user_id=(select auth.uid()) and (not write_access or role in ('owner','editor'))); $$;
revoke all on function crm_private.can_access(uuid,boolean) from public,anon;
grant execute on function crm_private.can_access(uuid,boolean) to authenticated;
create table public.crm_records(
 id uuid primary key default gen_random_uuid(),brand_id uuid not null references public.crm_brands(id),
 kind text not null check(kind in ('contact','deal','task','order','product')),
 name text not null check(length(trim(name)) between 1 and 200),status text not null,
 owner_id uuid,related_id uuid,
 email text not null default '' check(length(email)<=320),phone text not null default '' check(length(phone)<=100),website text not null default '' check(website='' or website ~* '^https?://'),
 source text not null default '' check(length(source)<=500),notes text not null default '' check(length(notes)<=20000),
 due_date date,amount_cents bigint not null default 0 check(amount_cents between 0 and 10000000000),paid_cents bigint not null default 0 check(paid_cents>=0 and paid_cents<=amount_cents),quantity integer not null default 1 check(quantity between 1 and 1000000),
 archived boolean not null default false,version integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(brand_id,id),foreign key(brand_id,owner_id) references public.crm_members(brand_id,user_id) on delete set null (owner_id),foreign key(brand_id,related_id) references public.crm_records(brand_id,id),
 check((kind='contact' and status in ('Repéré','À qualifier','Qualifié','Partenaire','Client','Ne plus contacter')) or (kind='deal' and status in ('À préparer','Contacté','Échange en cours','Offre transmise','Gagné','Perdu')) or (kind='task' and status in ('À faire','En cours','Terminé')) or (kind='order' and status in ('À confirmer','Acompte attendu','En production','Solde attendu','Expédiée','Livrée','Annulée')) or (kind='product' and status in ('Actif','À valider','Archivé')))
);
create unique index crm_contact_email_unique on public.crm_records(brand_id,lower(trim(email))) where kind='contact' and email<>'' and not archived;
create index crm_records_brand on public.crm_records(brand_id,kind,archived);
create index crm_records_owner on public.crm_records(brand_id,owner_id);
create index crm_records_related on public.crm_records(brand_id,related_id);
create index crm_members_user on public.crm_members(user_id,brand_id);
create table public.crm_events(id uuid primary key default gen_random_uuid(),brand_id uuid not null references public.crm_brands(id),record_id uuid not null references public.crm_records(id),actor_id uuid,record_name text not null,action text not null,created_at timestamptz not null default now());
create index crm_events_brand on public.crm_events(brand_id,created_at desc);
create function crm_private.record_before() returns trigger language plpgsql set search_path='' as $$ begin
 if TG_OP='UPDATE' then
 if new.brand_id<>old.brand_id or new.id<>old.id or new.kind<>old.kind then raise exception 'Identity and brand cannot change'; end if;
 new.version=old.version+1;new.created_at=old.created_at;
 else new.version=1;new.created_at=now(); end if;
 new.updated_at=now();return new;
end; $$;
create function crm_private.record_after() returns trigger language plpgsql security definer set search_path='' as $$ begin
 insert into public.crm_events(brand_id,record_id,actor_id,record_name,action) values(new.brand_id,new.id,auth.uid(),new.name,case when TG_OP='INSERT' then 'Création' when new.archived and not old.archived then 'Archivage' when not new.archived and old.archived then 'Restauration' else 'Modification' end);return new;
end; $$;
revoke all on function crm_private.record_before(),crm_private.record_after() from public,anon,authenticated;
create trigger crm_record_before before insert or update on public.crm_records for each row execute function crm_private.record_before();
create trigger crm_record_after after insert or update on public.crm_records for each row execute function crm_private.record_after();
alter table public.crm_brands enable row level security;
alter table public.crm_members enable row level security;
alter table public.crm_records enable row level security;
alter table public.crm_events enable row level security;
revoke all on public.crm_brands,public.crm_members,public.crm_records,public.crm_events from anon,authenticated;
grant select on public.crm_brands,public.crm_members,public.crm_records,public.crm_events to authenticated;
grant insert,update on public.crm_records to authenticated;
create policy crm_brand_read on public.crm_brands for select to authenticated using(crm_private.can_access(id));
create policy crm_member_read on public.crm_members for select to authenticated using(crm_private.can_access(brand_id));
create policy crm_record_read on public.crm_records for select to authenticated using(crm_private.can_access(brand_id));
create policy crm_record_insert on public.crm_records for insert to authenticated with check(crm_private.can_access(brand_id,true));
create policy crm_record_update on public.crm_records for update to authenticated using(crm_private.can_access(brand_id,true)) with check(crm_private.can_access(brand_id,true));
create policy crm_event_read on public.crm_events for select to authenticated using(crm_private.can_access(brand_id));
-- Only an existing brand owner may create a brand, always with themselves as owner.
create function public.crm_create_brand(brand_name text) returns uuid language plpgsql security definer set search_path='' as $$ declare b uuid; n text; begin
 if auth.uid() is null or not exists(select 1 from public.crm_members where user_id=auth.uid() and role='owner') then raise exception 'Owner required'; end if;
 select display_name into n from public.crm_members where user_id=auth.uid() limit 1;
 insert into public.crm_brands(name) values(trim(brand_name)) returning id into b;
 insert into public.crm_members(brand_id,user_id,display_name,role) values(b,auth.uid(),n,'owner');return b;
end; $$;
revoke all on function public.crm_create_brand(text) from public,anon;
grant execute on function public.crm_create_brand(text) to authenticated;
commit;
