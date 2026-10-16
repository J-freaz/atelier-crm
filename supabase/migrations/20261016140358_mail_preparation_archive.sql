begin;
alter table public.crm_mail_outbox drop constraint crm_mail_outbox_status_check;
alter table public.crm_mail_outbox add constraint crm_mail_outbox_status_check check(status in ('prepared','sending','sent','unknown','archived'));
create or replace function public.crm_mail_internal(operation text,actor uuid,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare b constant uuid := 'db60e148-afb6-4870-9c8e-1c9330706f22'; m public.crm_members; c public.crm_records; o public.crm_mail_outbox; item jsonb; rowid uuid;
begin
 select * into m from public.crm_members where brand_id=b and user_id=actor;
 if not found or m.role not in ('owner','editor') then raise exception 'Editor required'; end if;
 if operation='token' then return (select jsonb_build_object('cipher',refresh_cipher) from crm_private.gmail_connection where brand_id=b); end if;
 if operation='prepare' then
  if (payload->>'test')::boolean then
   if m.role<>'owner' or (payload->>'recipient') not in ('jeff91540@gmail.com','nanayebylyne@gmail.com') then raise exception 'Invalid test'; end if;
  else
   select * into c from public.crm_records where id=(payload->>'contact_id')::uuid and brand_id=b and kind='contact' and not archived and status<>'Ne plus contacter' for share;
   if not found or lower(c.email)<>lower(payload->>'recipient') or c.email='' then raise exception 'Active contact and matching email required'; end if;
  end if;
  if length(payload->>'subject') not between 1 and 200 or length(payload->>'body') not between 1 and 20000 or length(payload->>'content_hash')<>43 then raise exception 'Invalid message'; end if;
  insert into public.crm_mail_outbox(brand_id,contact_id,actor_id,actor_name,recipient,subject,body,attachment,attachment_hash,content_hash,test)
  values(b,c.id,actor,m.display_name,payload->>'recipient',payload->>'subject',payload->>'body',payload->>'attachment',payload->>'attachment_hash',payload->>'content_hash',(payload->>'test')::boolean)
  on conflict(brand_id,content_hash) do nothing returning id into rowid;
  if rowid is null then select id into rowid from public.crm_mail_outbox where brand_id=b and content_hash=payload->>'content_hash'; end if;
  return (select to_jsonb(x) from public.crm_mail_outbox x where id=rowid);
 end if;
 if operation in ('get','claim','sent','unknown','archive','restore') then
  select * into o from public.crm_mail_outbox where id=(payload->>'id')::uuid and brand_id=b for update;
  if not found or o.actor_id<>actor then raise exception 'Message author required'; end if;
  if operation='get' then return to_jsonb(o); end if;
  if operation in ('archive','restore') then
   if (operation='archive' and o.status<>'prepared') or (operation='restore' and o.status<>'archived') then raise exception 'Preparation state changed'; end if;
   update public.crm_mail_outbox set status=case when operation='archive' then 'archived' else 'prepared' end where id=o.id returning * into o;
   if o.contact_id is not null then insert into public.crm_events(brand_id,record_id,actor_id,record_name,action) select b,o.contact_id,actor,name,case when operation='archive' then 'Préparation e-mail archivée' else 'Préparation e-mail restaurée' end from public.crm_records where id=o.contact_id; end if;
   return to_jsonb(o);
  end if;
  if operation='claim' then
   if o.status<>'prepared' then return null; end if;
   if not o.test then
    perform 1 from public.crm_records where id=o.contact_id and brand_id=b and not archived and status<>'Ne plus contacter' and lower(email)=o.recipient for share;
    if not found then raise exception 'Contact changed or excluded'; end if;
   end if;
   update public.crm_mail_outbox set status='sending' where id=o.id returning * into o;return to_jsonb(o);
  elsif operation='sent' then
   if o.status<>'sending' then raise exception 'Invalid status'; end if;
   update public.crm_mail_outbox set status='sent',gmail_id=payload->>'gmail_id',thread_id=payload->>'thread_id',sent_at=now() where id=o.id returning * into o;
   if o.contact_id is not null then insert into public.crm_events(brand_id,record_id,actor_id,record_name,action) select b,o.contact_id,actor,name,'E-mail envoyé via la boîte commerciale' from public.crm_records where id=o.contact_id; end if;
  else update public.crm_mail_outbox set status='unknown' where id=o.id and status='sending' returning * into o;
  end if;return to_jsonb(o);
 end if;
 if operation='test-history' then
  select * into o from public.crm_mail_outbox where id=(payload->>'id')::uuid and brand_id=b and test;
  if not found or m.role<>'owner' then raise exception 'Test owner required'; end if;
  return coalesce((select jsonb_agg(r) from public.crm_mail_received r where r.brand_id=b and r.thread_id=o.thread_id and r.direction='incoming'),'[]'::jsonb);
 end if;
 if operation='threads' then
  if payload->>'test_id' is not null then
   if m.role<>'owner' then raise exception 'Test owner required'; end if;
   return coalesce((select jsonb_agg(t) from (select thread_id from public.crm_mail_outbox where brand_id=b and id=(payload->>'test_id')::uuid and test and status='sent') t),'[]'::jsonb);
  end if;
  return coalesce((select jsonb_agg(t) from (select distinct thread_id,contact_id from public.crm_mail_outbox where brand_id=b and contact_id=(payload->>'contact_id')::uuid and status='sent' and not test order by thread_id limit 21) t),'[]'::jsonb);
 elsif operation='receive' then
  if jsonb_array_length(payload->'messages')>100 then raise exception 'Batch too large'; end if;
  for item in select * from jsonb_array_elements(payload->'messages') loop
   select contact_id into rowid from public.crm_mail_outbox where brand_id=b and thread_id=item->>'thread_id' and status='sent' and (not test or m.role='owner') limit 1;
   if not found then raise exception 'Untracked thread'; end if;
   insert into public.crm_mail_received(brand_id,contact_id,gmail_id,thread_id,sender,subject,snippet,direction,received_at)
   values(b,rowid,item->>'gmail_id',item->>'thread_id',left(item->>'sender',500),left(item->>'subject',500),left(item->>'snippet',2000),item->>'direction',(item->>'received_at')::timestamptz)
   on conflict(brand_id,gmail_id) do nothing;
  end loop;return '{}'::jsonb;
 end if;
 raise exception 'Unknown operation';
end; $$;
revoke all on function public.crm_mail_internal(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.crm_mail_internal(text,uuid,jsonb) to service_role;
commit;
