// Local PostgreSQL-compatible checks only. No cloud connection.
// PGLITE_MODULE=/absolute/path/to/pglite/dist/index.js node tests/operia-migration-check.mjs
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {emptyOperia} from '../operia-domain.mjs';
const {PGlite}=await import(process.env.PGLITE_MODULE);
const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`);
for(const path of ['database/001_crm.sql','database/002_brand_privileges.sql','database/005_operia_profile.sql'])await db.exec(await readFile(new URL('../'+path,import.meta.url),'utf8'));
const owner='00000000-0000-4000-8000-000000000001',editor='00000000-0000-4000-8000-000000000002',viewer='00000000-0000-4000-8000-000000000003',outside='00000000-0000-4000-8000-000000000004',brand='00000000-0000-4000-8000-000000000010',general='00000000-0000-4000-8000-000000000011';
await db.exec(`insert into auth.users values('${owner}'),('${editor}'),('${viewer}'),('${outside}');insert into crm_brands(id,name,profile) values('${brand}','Opéria test','operia'),('${general}','Nanayé test','general');insert into crm_members(brand_id,user_id,display_name,role) values('${brand}','${owner}','Owner','owner'),('${general}','${owner}','Owner','owner'),('${brand}','${editor}','Editor','editor'),('${brand}','${viewer}','Viewer','viewer');set role authenticated;set request.jwt.claim.sub='${owner}';`);
const as=async id=>db.exec(`set request.jwt.claim.sub='${id}';`);
const insert=async (brandId,meta,name='Entreprise fictive',status='À qualifier')=>(await db.query(`insert into crm_records(brand_id,kind,name,status,metadata) values($1,'contact',$2,$3,$4) returning *`,[brandId,name,status,meta])).rows[0];
const metadata={operia:{...emptyOperia(),siren:'123456789',legacy:{source:'ancien',id:'lead1'}}};
const first=await insert(brand,metadata);
assert.equal(first.metadata.operia.siren,'123456789');
// Existing general records retain their status and TTC values unchanged.
const nanaye=(await db.query(`insert into crm_records(brand_id,kind,name,status,amount_cents,paid_cents) values($1,'order','Exemple Nanayé','En production',45000,15000) returning *`,[general])).rows[0];
assert.equal(nanaye.amount_cents,45000);assert.equal(nanaye.paid_cents,15000);assert.deepEqual(nanaye.metadata,{});
await assert.rejects(()=>insert(general,{operia:emptyOperia()}),/Operia profile required/);
await assert.rejects(()=>insert(brand,{operia:{stage:'Inventé'}}),/crm_records_metadata_valid/);
await assert.rejects(()=>insert(brand,{operia:{monthlyHtCents:-100}}),/crm_records_metadata_valid/);
await assert.rejects(()=>insert(brand,{operia:{monthlyHtCents:0.1}}),/crm_records_metadata_valid/);
await assert.rejects(()=>insert(brand,{operia:{fit:{sites:-1}}}),/crm_records_metadata_valid/);
await assert.rejects(()=>insert(brand,{operia:{activities:[{amountHtCents:-1}]}}),/crm_records_metadata_valid/);
await assert.rejects(()=>insert(brand,{operia:{siren:'1234'}}),/crm_records_metadata_valid/);
await assert.rejects(()=>insert(brand,{operia:{siren:'123456789'}}),/crm_operia_siren_unique/);
await assert.rejects(()=>insert(brand,{operia:{legacy:{source:'ancien',id:'lead1'}}}),/crm_operia_legacy_unique/);
await db.query('update crm_records set archived=true where id=$1',[first.id]);
await assert.rejects(()=>insert(brand,{operia:{siren:'123456789'}}),/crm_operia_siren_unique/);
// Native suppression and metadata agree, including clients that change just one of them.
const opposed=await insert(brand,{operia:{...emptyOperia(),siren:'987654321',stage:'Opposition'}});
assert.equal(opposed.status,'Ne plus contacter');
await db.query("update crm_records set metadata=jsonb_set(metadata,'{operia,stage}','\"Contacté\"') where id=$1",[opposed.id]);
assert.equal((await db.query('select metadata from crm_records where id=$1',[opposed.id])).rows[0].metadata.operia.stage,'Opposition');
await assert.rejects(()=>db.query("update crm_records set status='À qualifier',metadata='{}' where id=$1",[opposed.id]),/Opposition cannot be removed/);
// Editor can write company metadata but cannot create or change profiles.
await as(editor);
await insert(brand,{operia:{...emptyOperia(),siren:'222222222'}},'Deuxième entreprise');
await assert.rejects(()=>db.query("select crm_create_profiled_brand('Interdit','operia')"),/Owner required/);
await assert.rejects(()=>db.query("select crm_set_brand_profile($1,'general')",[brand]),/Brand owner required/);
assert.equal((await db.query('select * from crm_records where brand_id=$1',[general])).rows.length,0);
await assert.rejects(()=>insert(general,{}),/row-level security/);
await as(viewer);
assert.ok((await db.query('select * from crm_records')).rows.length>0);
await assert.rejects(()=>insert(brand,{operia:emptyOperia()}),/row-level security/);
assert.equal((await db.query('update crm_records set notes=$1 where id=$2 returning id',['No',opposed.id])).rows.length,0);
await as(outside);
assert.equal((await db.query('select * from crm_records')).rows.length,0);
assert.equal((await db.query('select * from crm_brands')).rows.length,0);
await assert.rejects(()=>db.query("select crm_create_profiled_brand('Interdit','operia')"),/Owner required/);
await assert.rejects(()=>db.query("select crm_set_brand_profile($1,'general')",[brand]),/Brand owner required/);
// Brand creation is atomic and attributes the authenticated owner, not supplied metadata.
await as(owner);
const newBrand=(await db.query("select crm_create_profiled_brand('Opéria test 2','operia') as id")).rows[0].id;
assert.equal((await db.query('select profile from crm_brands where id=$1',[newBrand])).rows[0].profile,'operia');
assert.equal((await db.query('select user_id,role from crm_members where brand_id=$1',[newBrand])).rows[0].user_id,owner);
await insert(newBrand,{operia:{siren:'123456789'}}); // Uniqueness is per brand.
await assert.rejects(()=>db.query("select crm_set_brand_profile($1,'general')",[newBrand]),/Operia companies already exist/);
await assert.rejects(()=>db.query("update crm_brands set profile='general' where id=$1",[newBrand]),/permission denied/);
const emptyBrand=(await db.query("select crm_create_brand('Nouvelle marque') as id")).rows[0].id;
await db.query("select crm_set_brand_profile($1,'operia')",[emptyBrand]);
assert.equal((await db.query('select profile from crm_brands where id=$1',[emptyBrand])).rows[0].profile,'operia');
await db.exec('set role anon');
await assert.rejects(()=>db.query("select crm_create_profiled_brand('Interdit','operia')"),/permission denied/);
await assert.rejects(()=>db.query('select * from crm_records'),/permission denied/);
await db.close();
console.log('Opéria SQL: profiles, Nanayé compatibility, metadata validation, brand isolation, four roles, SIREN/legacy idempotency and opposition passed.');
