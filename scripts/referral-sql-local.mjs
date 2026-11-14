// Local PostgreSQL semantics only. Hosted schema and trigger behavior require the separate rolled-back probe.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const modulePath = process.env.PGLITE_MODULE ?? '.referral-tools/node_modules/@electric-sql/pglite/dist/index.js';
const { PGlite } = await import(pathToFileURL(resolve(modulePath)).href);
const db = new PGlite();
await db.exec(`
create schema auth; create schema extensions;
create role anon; create role authenticated; create role service_role;
create table auth.users(id uuid primary key);
create table public.parents(id uuid primary key references auth.users(id),name text,email text,postal text,deletion_requested_at timestamptz);
create table public.children(id uuid primary key,parent_id uuid references parents(id) on delete cascade,first_name text,grade integer,province text);
create table public.card_setups(id uuid primary key default gen_random_uuid(),parent_id uuid references parents(id) on delete cascade,child_id uuid references children(id) on delete cascade,plan text,price numeric,stripe_customer_id text);
create table public.plan_starts(card_setup_id uuid,parent_id uuid,state text,trial_end timestamptz);
create table public.child_plan_states(child_id uuid,kind text);
create table public.child_deletions(child_id uuid);
create table public.admin_users(user_id uuid,email text,name text);
create table public.family_delete_holds(parent_id uuid,lease_until timestamptz);
create table public.family_deletions(parent_id uuid);
create table public.family_card_operations(id uuid primary key,parent_id uuid references parents(id) on delete cascade);
create function public.is_admin() returns boolean language sql as $$ select false $$;
create function public.assert_family_writable(p uuid) returns void language plpgsql as $$ begin
 perform 1 from public.parents where id=p for update;
 if not found or exists(select 1 from public.parents where id=p and deletion_requested_at is not null) then raise exception 'family_unavailable'; end if;
end $$;
create function public.begin_family_card_operation(p uuid,token uuid) returns void language plpgsql as $$ begin perform public.assert_family_writable(p); insert into public.family_card_operations values(token,p); end $$;
create function public.end_family_card_operation(token uuid) returns void language sql as $$ delete from public.family_card_operations where id=token $$;
`);

try {
 await db.exec(await readFile('supabase/migrations/20261113234609_family_referrals.sql','utf8'));
 await db.exec(await readFile('supabase/tests/referrals_rollback.sql','utf8'));
 const counts = await db.query('select (select count(*) from parents) parents,(select count(*) from referral_rewards) rewards');
 if (counts.rows.some(r => r.parents !== 0 || r.rewards !== 0)) throw Error('Synthetic transaction did not roll back');
 console.log('REFERRAL_SQL_LOCAL_PASS: migration and synthetic rollback probe; stub platform fences, no hosted proof');
} catch (e) { console.error("REFERRAL_SQL_LOCAL_FAIL",e.message,e.where ?? ""); process.exitCode=1; } finally { await db.close(); }
