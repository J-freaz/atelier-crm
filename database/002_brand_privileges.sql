alter function public.crm_create_brand(text) set schema crm_private;
create function public.crm_create_brand(brand_name text) returns uuid language sql security invoker set search_path='' as $$ select crm_private.crm_create_brand(brand_name); $$;
revoke all on function public.crm_create_brand(text) from public,anon;
grant execute on function public.crm_create_brand(text) to authenticated;
