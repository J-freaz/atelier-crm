-- Run on the dedicated CRM database after 001_crm.sql, before real-data import.
-- All fixtures and writes are rolled back. Never run against KIVOUFO.
begin;
insert into auth.users(id,aud,role,email) values
('10000000-0000-4000-8000-000000000001','authenticated','authenticated','owner-a@test.invalid'),
('10000000-0000-4000-8000-000000000002','authenticated','authenticated','editor-a@test.invalid'),
('10000000-0000-4000-8000-000000000003','authenticated','authenticated','viewer-a@test.invalid'),
('10000000-0000-4000-8000-000000000004','authenticated','authenticated','owner-b@test.invalid');
insert into public.crm_brands(id,name) values
('20000000-0000-4000-8000-000000000001','Recette marque A'),
('20000000-0000-4000-8000-000000000002','Recette marque B');
insert into public.crm_members(brand_id,user_id,display_name,role) values
('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Owner A','owner'),
('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','Editor A','editor'),
('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','Viewer A','viewer'),
('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000004','Owner B','owner');
insert into public.crm_records(id,brand_id,kind,name,status) values
('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','contact','Recette A','Repéré'),
('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','contact','Recette B','Repéré');
set local role anon;
do $$ begin
 begin perform count(*) from public.crm_records; raise exception 'FAIL anonymous table access'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ declare n integer; begin
 select count(*) into n from public.crm_records where id in ('30000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002');
 if n<>1 then raise exception 'FAIL cross-brand read'; end if;
 update public.crm_records set notes='Editor writes own brand' where id='30000000-0000-4000-8000-000000000001' and version=1;
 get diagnostics n=row_count; if n<>1 then raise exception 'FAIL editor own-brand update'; end if;
 update public.crm_records set notes='Stale write' where id='30000000-0000-4000-8000-000000000001' and version=1;
 get diagnostics n=row_count; if n<>0 then raise exception 'FAIL optimistic concurrency'; end if;
 update public.crm_records set notes='Cross brand' where id='30000000-0000-4000-8000-000000000002';
 get diagnostics n=row_count; if n<>0 then raise exception 'FAIL cross-brand update'; end if;
 begin insert into public.crm_records(brand_id,kind,name,status) values('20000000-0000-4000-8000-000000000002','contact','Forbidden','Repéré'); raise exception 'FAIL cross-brand insert'; exception when insufficient_privilege then null; end;
 begin update public.crm_members set role='owner' where user_id='10000000-0000-4000-8000-000000000002'; raise exception 'FAIL self escalation'; exception when insufficient_privilege then null; end;
 begin insert into public.crm_records(brand_id,kind,name,status,related_id) values('20000000-0000-4000-8000-000000000001','deal','Cross relation','À préparer','30000000-0000-4000-8000-000000000002'); raise exception 'FAIL cross-brand relation'; exception when foreign_key_violation then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ declare n integer; begin
 update public.crm_records set notes='Viewer writes' where id='30000000-0000-4000-8000-000000000001'; get diagnostics n=row_count;
 if n<>0 then raise exception 'FAIL viewer update'; end if;
 if not exists(select 1 from public.crm_records where id='30000000-0000-4000-8000-000000000001') then raise exception 'FAIL viewer read'; end if;
end $$;
reset role;
delete from public.crm_members where user_id='10000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
 if exists(select 1 from public.crm_records where id='30000000-0000-4000-8000-000000000001') then raise exception 'FAIL revoked member access'; end if;
end $$;
reset role;
select 'PASS: anonymous, brand isolation, editor, viewer, escalation, relations, concurrency, revocation' as result;
rollback;
