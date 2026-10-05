begin;
insert into auth.users(id,aud,role,email,email_confirmed_at) values
('10000000-0000-4000-8000-000000000011','authenticated','authenticated','verified@test.invalid',now()),
('10000000-0000-4000-8000-000000000012','authenticated','authenticated','unverified@test.invalid',null);
insert into public.crm_brands(id,name) values('20000000-0000-4000-8000-000000000011','Reserved access test');
insert into crm_private.reserved_access(email,brand_id,display_name,role) values
('verified@test.invalid','20000000-0000-4000-8000-000000000011','Verified','owner'),
('unverified@test.invalid','20000000-0000-4000-8000-000000000011','Unverified','editor');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000012","role":"authenticated"}',true);
do $$ begin if public.crm_claim_access()<>0 then raise exception 'FAIL unverified email'; end if; end $$;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000011","role":"authenticated"}',true);
do $$ begin
 if public.crm_claim_access()<>1 then raise exception 'FAIL verified claim'; end if;
 if public.crm_claim_access()<>0 then raise exception 'FAIL claim reused'; end if;
 if not exists(select 1 from public.crm_members where user_id='10000000-0000-4000-8000-000000000011' and role='owner') then raise exception 'FAIL membership'; end if;
end $$;
reset role;
delete from public.crm_members where user_id='10000000-0000-4000-8000-000000000011';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000011","role":"authenticated"}',true);
do $$ begin if public.crm_claim_access()<>0 then raise exception 'FAIL revoked access reclaimed'; end if; end $$;
reset role;
select 'PASS: verified email only, single claim, revoked access cannot be reclaimed' as result;
rollback;
