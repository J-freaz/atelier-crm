begin;
create table crm_private.scan_requests(id bigint generated always as identity primary key,user_id uuid not null,brand_id uuid not null,created_at timestamptz not null default now());
create index scan_requests_brand_date on crm_private.scan_requests(brand_id,created_at);
alter table crm_private.scan_requests enable row level security;
revoke all on crm_private.scan_requests from public,anon,authenticated;
create policy scan_requests_deny on crm_private.scan_requests for all to authenticated using(false) with check(false);
create function crm_private.reserve_scan(record_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare b uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select brand_id into b from public.crm_records where id=record_id and kind='contact' and not archived and status<>'Ne plus contacter';
 if b is null or not crm_private.can_access(b,true) then raise exception 'Contact inaccessible'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(b::text,0));
 if (select count(*) from crm_private.scan_requests where brand_id=b and created_at>now()-interval '1 day')>=40 or (select count(*) from crm_private.scan_requests where brand_id=b and user_id=auth.uid() and created_at>now()-interval '1 hour')>=10 then return false; end if;
 delete from crm_private.scan_requests where brand_id=b and created_at<now()-interval '7 days';
 insert into crm_private.scan_requests(user_id,brand_id) values(auth.uid(),b);
 return true;
end;$$;
revoke all on function crm_private.reserve_scan(uuid) from public,anon;
grant execute on function crm_private.reserve_scan(uuid) to authenticated;
create function public.crm_reserve_scan(record_id uuid) returns boolean language sql security invoker set search_path='' as $$ select crm_private.reserve_scan(record_id); $$;
revoke all on function public.crm_reserve_scan(uuid) from public,anon;
grant execute on function public.crm_reserve_scan(uuid) to authenticated;
commit;
