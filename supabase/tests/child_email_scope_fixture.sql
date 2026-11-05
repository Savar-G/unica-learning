-- Local synthetic fixture only. Do not run on a hosted database.


create schema storage;
create schema auth;
create table auth.users(id uuid primary key,email text);
create table parents(id uuid primary key references auth.users on delete cascade, deletion_requested_at timestamptz, name text, email text);
create table children(id uuid primary key, parent_id uuid references parents on delete cascade, first_name text, former_names text[], grade int, province text, unique(id,parent_id));
create table assessments(id uuid primary key, parent_id uuid references parents on delete cascade, child_id uuid references children on delete cascade, grade int, province text, started_at timestamptz);
create table workbooks(id uuid primary key, parent_id uuid references parents on delete cascade, child_id uuid references children on delete cascade);
create table workbook_drafts(id uuid primary key, parent_id uuid references parents on delete cascade, child_id uuid references children on delete cascade);
create table scan_photos(id uuid primary key, parent_id uuid references parents on delete cascade, child_id uuid references children on delete cascade);
create table workbook_runs(id uuid primary key, child_id uuid); create table workbook_edits(id uuid primary key, child_id uuid);
create table maya_calls(id uuid primary key, parent_id uuid references parents on delete cascade, child_id uuid references children on delete cascade);
create table card_setups(id uuid primary key, child_id uuid references children on delete cascade);
create table reports(id uuid primary key, child_id uuid references children on delete cascade);
create table email_log(id uuid primary key default gen_random_uuid(), parent_id uuid references parents on delete cascade, child_id uuid references children on delete cascade, assessment_id uuid references assessments on delete cascade, call_ids uuid[], kind text, status text, attempts int default 1, summary_month date, unsubscribe_hash text, sent_at timestamptz, email_id text, error text, week_start date, day date);
create unique index monthly_slot on email_log(parent_id,summary_month) where kind='monthly_summary';
create table email_copies(id uuid default gen_random_uuid(), parent_id uuid references parents on delete cascade, email_log_id uuid unique references email_log on delete cascade, report_id uuid references reports on delete cascade, subject text, text_body text, html_body text, outcome text, to_address text);
create table family_card_operations(id uuid primary key, parent_id uuid);
create table family_delete_holds(parent_id uuid primary key, lease_token uuid, lease_until timestamptz);
create table family_deletions(parent_id uuid primary key, phase text, lease_token uuid, lease_until timestamptz);
create table anonymous_tests(id uuid default gen_random_uuid() primary key, copy_version smallint,grade int,province text,test_month date,test_family boolean,copy jsonb);
create table anonymous_test_links(assessment_id uuid references assessments on delete cascade,copy_id uuid references anonymous_tests);
create table test_accounts(parent_id uuid);
create table admin_users(user_id uuid);
create table storage.objects(bucket_id text,name text);
create function family_copy_sources(p uuid) returns jsonb language sql as $$ select '[]'::jsonb $$;
