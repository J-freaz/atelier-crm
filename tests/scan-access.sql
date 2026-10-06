begin;
insert into auth.users(id,aud,role,email,email_confirmed_at) values ('10000000-0000-4000-8000-000000000021','authenticated','authenticated','scan@test.invalid',now());
insert into public.crm_brands(id,name) values ('20000000-0000-4000-8000-000000000021','Scan test');
insert into public.crm_members(brand_id,user_id,display_name,role) values ('20000000-0000-4000-8000-000000000021','10000000-0000-4000-8000-000000000021','Scan tester','editor');
insert into public.crm_records(id,brand_id,kind,name,status) values ('30000000-0000-4000-8000-000000000021','20000000-0000-4000-8000-000000000021','contact','Synthetic scan contact','Repéré');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000021","role":"authenticated"}',true);
do $$ begin
 for i in 1..10 loop if not public.crm_reserve_scan('30000000-0000-4000-8000-000000000021') then raise exception 'FAIL reservation';end if;end loop;
 if public.crm_reserve_scan('30000000-0000-4000-8000-000000000021') then raise exception 'FAIL limit';end if;
 begin perform public.crm_reserve_scan('30000000-0000-4000-8000-000000000022');raise exception 'FAIL other brand';exception when raise_exception then if SQLERRM<>'Contact inaccessible' then raise;end if;end;
 update public.crm_records set status='Ne plus contacter' where id='30000000-0000-4000-8000-000000000021';
 begin perform public.crm_reserve_scan('30000000-0000-4000-8000-000000000021');raise exception 'FAIL opt out';exception when raise_exception then if SQLERRM<>'Contact inaccessible' then raise;end if;end;
end $$;
reset role;
update public.crm_records set status='Repéré' where id='30000000-0000-4000-8000-000000000021';
update public.crm_members set role='viewer' where user_id='10000000-0000-4000-8000-000000000021';
set local role authenticated;
do $$ begin
 begin perform public.crm_reserve_scan('30000000-0000-4000-8000-000000000021');raise exception 'FAIL viewer';exception when raise_exception then if SQLERRM<>'Contact inaccessible' then raise;end if;end;
end $$;
reset role;
select 'PASS: editor, rate limit, missing contact, opt out, viewer denied' as result;
rollback;
