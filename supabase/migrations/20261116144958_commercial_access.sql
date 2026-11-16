-- Restricted Opéria sales access. No memberships or invitations are created here.
begin;

alter table public.crm_members drop constraint crm_members_role_check;
alter table public.crm_members add constraint crm_members_role_check check(role in ('owner','editor','viewer','commercial'));
alter table crm_private.reserved_access drop constraint reserved_access_role_check;
alter table crm_private.reserved_access add constraint reserved_access_role_check check(role in ('owner','editor','viewer','commercial'));

create function crm_private.commercial_brand_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.role='commercial' and not exists(select 1 from public.crm_brands b where b.id=new.brand_id and b.profile='operia') then
  raise exception 'Commercial role requires an Operia brand';
 end if;
 return new;
end; $$;
revoke all on function crm_private.commercial_brand_guard() from public,anon,authenticated;
create trigger crm_commercial_member_brand before insert or update on public.crm_members for each row execute function crm_private.commercial_brand_guard();
create trigger crm_commercial_reserved_brand before insert or update on crm_private.reserved_access for each row execute function crm_private.commercial_brand_guard();

create function crm_private.commercial_profile_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.profile<>'operia' and old.profile='operia' and (
  exists(select 1 from public.crm_members m where m.brand_id=new.id and m.role='commercial') or
  exists(select 1 from crm_private.reserved_access a where a.brand_id=new.id and a.role='commercial')) then
  raise exception 'Remove commercial memberships and reservations before changing profile';
 end if;
 return new;
end; $$;
revoke all on function crm_private.commercial_profile_guard() from public,anon,authenticated;
create trigger crm_commercial_profile before update on public.crm_brands for each row execute function crm_private.commercial_profile_guard();

-- This helper means BRAND-WIDE access. Never include commercial here: existing
-- Gmail/scan and other brand-wide policies must continue to deny that role.
create or replace function crm_private.can_access(b uuid,write_access boolean default false) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.crm_members m
 where m.brand_id=b and m.user_id=auth.uid()
 and m.role in ('owner','editor','viewer') and (not write_access or m.role in ('owner','editor')));
$$;
revoke all on function crm_private.can_access(uuid,boolean) from public,anon;
grant execute on function crm_private.can_access(uuid,boolean) to authenticated;

create function crm_private.is_commercial(b uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.crm_members m
 join public.crm_brands b2 on b2.id=m.brand_id where m.brand_id=b and m.user_id=auth.uid()
 and m.role='commercial' and b2.profile='operia');
$$;
revoke all on function crm_private.is_commercial(uuid) from public,anon;
grant execute on function crm_private.is_commercial(uuid) to authenticated;

create function crm_private.can_access_record(b uuid,r uuid,write_access boolean default false) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.crm_records x
 where x.id=r and x.brand_id=b and (crm_private.can_access(b,write_access) or
 (crm_private.is_commercial(b) and x.kind in ('contact','task') and x.owner_id=auth.uid() and not x.archived
 and (x.kind<>'task' or x.related_id is null or exists(select 1 from public.crm_records c
 where c.id=x.related_id and c.brand_id=b and c.kind='contact' and c.owner_id=auth.uid() and not c.archived)))));
$$;
revoke all on function crm_private.can_access_record(uuid,uuid,boolean) from public,anon;
grant execute on function crm_private.can_access_record(uuid,uuid,boolean) to authenticated;

alter policy crm_brand_read on public.crm_brands using(crm_private.can_access(id) or crm_private.is_commercial(id));
alter policy crm_member_read on public.crm_members using(crm_private.can_access(brand_id) or (user_id=auth.uid() and crm_private.is_commercial(brand_id)));
alter policy crm_record_read on public.crm_records using(crm_private.can_access(brand_id) or (crm_private.is_commercial(brand_id) and owner_id=auth.uid() and kind in ('contact','task') and not archived));
alter policy crm_record_insert on public.crm_records with check(crm_private.can_access(brand_id,true) or (crm_private.is_commercial(brand_id) and owner_id=auth.uid() and kind in ('contact','task') and not archived));
alter policy crm_record_update on public.crm_records
 using(crm_private.can_access(brand_id,true) or (crm_private.is_commercial(brand_id) and owner_id=auth.uid() and kind in ('contact','task') and not archived))
 with check(crm_private.can_access(brand_id,true) or (crm_private.is_commercial(brand_id) and owner_id=auth.uid() and kind in ('contact','task') and not archived));
alter policy crm_event_read on public.crm_events using(crm_private.can_access(brand_id) or crm_private.can_access_record(brand_id,record_id));
alter policy draft_read on public.crm_message_drafts using(crm_private.can_access(brand_id) or crm_private.can_access_record(brand_id,contact_id));
alter policy draft_insert on public.crm_message_drafts with check(crm_private.can_access(brand_id,true) or crm_private.can_access_record(brand_id,contact_id,true));
alter policy draft_update on public.crm_message_drafts
 using(crm_private.can_access(brand_id,true) or crm_private.can_access_record(brand_id,contact_id,true))
 with check(crm_private.can_access(brand_id,true) or crm_private.can_access_record(brand_id,contact_id,true));

-- A task may not reveal the identity of a contact outside the assigned portfolio.
-- Existing tasks linked outside the portfolio are omitted until the owner fixes their assignment.
create function crm_private.commercial_task_link_visible(b uuid,k text,linked uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (k<>'task' or linked is null or exists(
 select 1 from public.crm_records c where c.id=linked and c.brand_id=b and c.kind='contact'
 and c.owner_id=auth.uid() and not c.archived and crm_private.is_commercial(b)));
$$;
revoke all on function crm_private.commercial_task_link_visible(uuid,text,uuid) from public,anon;
grant execute on function crm_private.commercial_task_link_visible(uuid,text,uuid) to authenticated;
-- A restrictive policy is ANDed with the existing write/read policies, including future permissive additions.
create policy crm_commercial_record_scope on public.crm_records as restrictive for all to authenticated
 using(not crm_private.is_commercial(brand_id) or (owner_id=auth.uid() and kind in ('contact','task') and not archived and crm_private.commercial_task_link_visible(brand_id,kind,related_id)))
 with check(not crm_private.is_commercial(brand_id) or (owner_id=auth.uid() and kind in ('contact','task') and not archived and crm_private.commercial_task_link_visible(brand_id,kind,related_id)));

create function crm_private.commercial_record_before() returns trigger language plpgsql security invoker set search_path='' as $$
declare op jsonb; previous jsonb; items jsonb; prior_items jsonb; item jsonb; index_no integer; actor uuid:=auth.uid();
 mutable text[]:=array['creationDate','city','naf','employees','registryStatus','registryDate','registrySource','contactName','contactRole','contactSource','contactVerifiedAt','businessEvidence','businessSource','businessDate','need','fit','stage','nextAction','due','activities'];
 allowed text[]:=array['id','kind','at','note','amountHtCents','source'];
begin
 if not crm_private.is_commercial(new.brand_id) then return new; end if;
 if actor is null then raise exception 'Authentication required'; end if;
 if TG_OP='INSERT' then new.owner_id:=coalesce(new.owner_id,actor); end if;
 if new.owner_id is distinct from actor or new.kind not in ('contact','task') or new.archived then raise exception 'Assigned active contact or task required'; end if;
 if TG_OP='UPDATE' then
  if old.owner_id is distinct from actor then raise exception 'Assigned record required'; end if;
  if (to_jsonb(new)-array['email','phone','website','notes','due_date','status','metadata']-(case when new.kind='task' then 'name' else '__none__' end))
     is distinct from (to_jsonb(old)-array['email','phone','website','notes','due_date','status','metadata']-(case when old.kind='task' then 'name' else '__none__' end)) then
   raise exception 'Commercial cannot change ownership, identity, provenance, amounts or archive state';
  end if;
  if left(new.notes,length(old.notes)) is distinct from old.notes then raise exception 'Existing notes must be preserved; append a new note'; end if;
 else
  if new.amount_cents<>0 or new.paid_cents<>0 or new.quantity<>1 then raise exception 'Commercial cannot set financial amounts'; end if;
 end if;
 if new.kind='task' then
  if TG_OP='UPDATE' and new.metadata is distinct from old.metadata then raise exception 'Task metadata is protected'; end if;
  if TG_OP='INSERT' and new.metadata<>'{}'::jsonb then raise exception 'Task metadata must be empty'; end if;
  if not crm_private.commercial_task_link_visible(new.brand_id,new.kind,new.related_id) then raise exception 'Related contact must be assigned to this commercial'; end if;
  return new;
 end if;
 if jsonb_typeof(new.metadata->'operia') is distinct from 'object' then raise exception 'Operia company metadata required'; end if;
 if TG_OP='INSERT' and new.related_id is not null then raise exception 'Company cannot link another record'; end if;
 op:=new.metadata->'operia';previous:=case when TG_OP='UPDATE' then coalesce(old.metadata->'operia','{}'::jsonb) else '{}'::jsonb end;
 if TG_OP='UPDATE' then
  if new.metadata-'operia' is distinct from old.metadata-'operia' or op-mutable is distinct from previous-mutable then
   raise exception 'Commercial cannot change SIREN, originator, financial terms, legacy or protected metadata';
  end if;
 else
  if new.metadata-'operia'<>'{}'::jsonb then raise exception 'Only Operia metadata is accepted'; end if;
  if coalesce(op->>'originator','')<>'' or (op ? 'monthlyHtCents' and op->'monthlyHtCents'<>'null'::jsonb) then raise exception 'Originator and financial terms require owner validation'; end if;
  if (op-array['schemaVersion','siren','originator','monthlyHtCents','legacy']-mutable)<>'{}'::jsonb then raise exception 'Unknown company metadata'; end if;
  if op ? 'legacy' then
   if jsonb_typeof(op->'legacy') is distinct from 'object' then raise exception 'Legacy source cannot be set by commercial'; end if;
   if exists(select 1 from jsonb_each(op->'legacy') kv where kv.value<>'""'::jsonb or kv.key not in ('source','id','created','updated','exportedAt','stage')) then raise exception 'Legacy source cannot be set by commercial'; end if;
  end if;
 end if;
 if new.status='Client' and (TG_OP='INSERT' or old.status<>'Client') then raise exception 'Won client requires owner validation'; end if;
 if op->>'stage'='Gagné' and (TG_OP='INSERT' or previous->>'stage' is distinct from 'Gagné') then raise exception 'Won stage requires owner validation'; end if;
 if TG_OP='UPDATE' then
  if previous->>'stage'='Gagné' and coalesce(op->>'stage','') not in ('Gagné','Opposition') then raise exception 'Validated won stage is protected'; end if;
  if old.status='Client' and new.status not in ('Client','Ne plus contacter') then raise exception 'Validated client status is protected'; end if;
 end if;
 items:=coalesce(op->'activities','[]'::jsonb);prior_items:=coalesce(previous->'activities','[]'::jsonb);
 if jsonb_typeof(items) is distinct from 'array' or jsonb_typeof(prior_items) is distinct from 'array' then raise exception 'Activity history must be an array'; end if;
 if jsonb_array_length(items)<jsonb_array_length(prior_items) then raise exception 'Activity history is append only'; end if;
 if jsonb_array_length(prior_items)>0 then
  for index_no in 0..jsonb_array_length(prior_items)-1 loop
   if items->index_no is distinct from prior_items->index_no then raise exception 'Activity history is append only'; end if;
  end loop;
 end if;
 if jsonb_array_length(items)>jsonb_array_length(prior_items) then
  for index_no in jsonb_array_length(prior_items)..jsonb_array_length(items)-1 loop
   item:=items->index_no;
   if jsonb_typeof(item) is distinct from 'object' or item-allowed<>'{}'::jsonb or coalesce(item->>'id','')='' or coalesce(item->>'note','')='' then raise exception 'Invalid appended activity'; end if;
   if coalesce(item->>'kind','') not in ('Note','Email envoyé','Appel effectué','Réponse reçue','Réponse positive','Démo tenue','Proposition envoyée') or (item ? 'amountHtCents' and item->'amountHtCents'<>'null'::jsonb) then raise exception 'Commercial activities must be nonfinancial'; end if;
   if coalesce(item->>'at','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}($|[T ])' or (item->>'at')::timestamptz>now() then raise exception 'Activity date must be valid and not in the future'; end if;
   if (new.status='Ne plus contacter' or op->>'stage'='Opposition') and item->>'kind'<>'Note' then raise exception 'Only notes may be appended to an opposed prospect'; end if;
   if exists(select 1 from jsonb_array_elements(items) with ordinality a(value,ordinality) where a.ordinality<>index_no+1 and a.value->>'id'=item->>'id') then raise exception 'Duplicate activity identity'; end if;
  end loop;
 end if;
 return new;
end; $$;
revoke all on function crm_private.commercial_record_before() from public,anon,authenticated;
create trigger crm_commercial_record_before before insert or update on public.crm_records for each row execute function crm_private.commercial_record_before();

create function crm_private.commercial_draft_before() returns trigger language plpgsql security invoker set search_path='' as $$
declare c public.crm_records;
begin
 if not crm_private.is_commercial(new.brand_id) then return new; end if;
 if auth.uid() is null or not crm_private.can_access_record(new.brand_id,new.contact_id,true) then raise exception 'Assigned contact required for this draft'; end if;
 select * into c from public.crm_records where id=new.contact_id and brand_id=new.brand_id and kind='contact';
 if not found or c.archived or c.status in ('Ne plus contacter','Client') or c.metadata->'operia'->>'stage' in ('Opposition','Perdu','Gagné') or c.metadata->'operia'->>'registryStatus'='C' then raise exception 'Active prospect required for a commercial draft'; end if;
 if new.attach_evjf is true then raise exception 'EVJF attachment is unavailable for Operia'; end if;
 return new;
end; $$;
revoke all on function crm_private.commercial_draft_before() from public,anon,authenticated;
create trigger crm_commercial_draft_before before insert or update on public.crm_message_drafts for each row execute function crm_private.commercial_draft_before();

-- Preserve the existing audit trail and actor integrity while permitting assigned sales drafts.
create or replace function crm_private.message_draft_after() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not crm_private.can_access_record(new.brand_id,new.contact_id,true) then raise exception 'Assigned writer required'; end if;
 insert into public.crm_events(brand_id,record_id,actor_id,record_name,action)
 select new.brand_id,new.contact_id,auth.uid(),name,'Brouillon enregistré (aucun envoi)' from public.crm_records where id=new.contact_id and brand_id=new.brand_id;
 return new;
end; $$;
revoke all on function crm_private.message_draft_after() from public,anon,authenticated;
commit;
