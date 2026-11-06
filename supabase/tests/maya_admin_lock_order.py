"""Two-session Postgres proof for #621. Requires psycopg 3 and an EMPTY scratch database.

Run with a database named unica_621_qa* only:
  python maya_admin_lock_order.py postgresql:///unica_621_qa --baseline
  python maya_admin_lock_order.py postgresql:///unica_621_qa --fixed
The baseline loads the relevant existing migrations and must detect two deadlocks.
The fixed run applies the new migration to that same database. No hosted data is used.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import time

import psycopg

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("dsn")
phase = parser.add_mutually_exclusive_group(required=True)
phase.add_argument("--baseline", dest="phase", action="store_const", const="baseline")
phase.add_argument("--fixed", dest="phase", action="store_const", const="fixed")
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
P = "62100000-0000-4000-8000-000000000001"
Q = "62100000-0000-4000-8000-000000000002"
ADMIN = "62100000-0000-4000-8000-000000000003"
MISSING = "62100000-0000-4000-8000-000000000004"


def connect():
    db = psycopg.connect(args.dsn, autocommit=True)
    assert db.execute("select current_database()").fetchone()[0].startswith("unica_621_qa"), "Scratch database required"
    db.execute("set statement_timeout = '8s'; set deadlock_timeout = '100ms'")
    return db


def source(name):
    return (root / "supabase/migrations" / name).read_text()


def function(sql, name):
    start = sql.index("create function public." + name)
    end = sql.index("end $$;", start) + len("end $$;")
    return sql[start:end]


def admin(db, user=ADMIN, role="authenticated"):
    db.execute("begin")
    db.execute("select set_config('request.jwt.claim.sub', %s, true)", (user,))
    db.execute("set local role " + role)


def result(db, sql):
    try:
        row = db.execute(sql).fetchone()
        return row[0] if row else None
    except psycopg.Error as error:
        return error.sqlstate


def blocked(observer, waiter, holder):
    end = time.monotonic() + 4
    while time.monotonic() < end:
        if observer.execute("select %s = any(pg_blocking_pids(%s))", (holder.info.backend_pid, waiter.info.backend_pid)).fetchone()[0]:
            return
        time.sleep(0.01)
    raise AssertionError("The intended sessions did not overlap")


with connect() as control, connect() as a, connect() as b, ThreadPoolExecutor(2) as workers:
    if args.phase == "baseline":
        assert not control.execute("select to_regclass('public.parents')").fetchone()[0], "Empty database required"
        control.execute("""
          do $$ declare r text; begin
            foreach r in array array['anon','authenticated','service_role'] loop
              if not exists(select 1 from pg_roles where rolname=r) then execute format('create role %I',r); end if;
            end loop;
          end $$;
          create schema auth;
          create function auth.uid() returns uuid language sql stable as
            $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
          grant usage on schema auth to authenticated;
          create table auth.users(id uuid primary key, email text);
          create table public.parents(id uuid primary key references auth.users(id) on delete cascade, deletion_requested_at timestamptz, name text, email text);
          create table public.assessments(id uuid primary key, parent_id uuid);
          create table public.admin_users(user_id uuid primary key, name text, email text);
          create function public.is_admin() returns boolean language sql stable security definer set search_path='' as
            $$ select exists(select 1 from public.admin_users where user_id=auth.uid()) $$;
        """)
        fence = source("20261011_add_family_deletion.sql")
        control.execute(function(fence, "assert_family_writable") + function(fence, "fence_family_write"))
        control.execute(source("20261012_add_test_accounts.sql"))
        control.execute(source("20261105073754_maya_chat_families.sql").split("-- Same note validation")[0])
        control.execute(source("20261105081527_maya_chat_rehearsal_guard.sql").split("-- Same claim")[0])
        control.execute(source("20261105124144_maya_chat_lock_order.sql").split("-- Same claim")[0])
    else:
        control.execute(next((root / "supabase/migrations").glob("*_maya_admin_lock_order.sql")).read_text())

    def fixture():
        control.execute("truncate auth.users cascade; truncate public.admin_users")
        control.execute("insert into auth.users(id) values (%s),(%s),(%s)", (P, Q, ADMIN))
        control.execute("insert into public.parents(id) values (%s),(%s)", (P, Q))
        control.execute("insert into public.admin_users(user_id) values (%s)", (ADMIN,))
        control.execute("insert into public.test_accounts(parent_id,marked_by) values (%s,%s),(%s,%s)", (P, ADMIN, Q, ADMIN))
        control.execute("insert into public.maya_chat_families(parent_id,added_by,rehearsal) values (%s,%s,true),(%s,%s,false)", (P, ADMIN, Q, ADMIN))

    old = [f"delete from public.test_accounts where parent_id='{P}' returning parent_id",
           f"update public.maya_chat_families set rehearsal=false where parent_id='{P}' returning parent_id"]
    fixed = [f"select public.admin_set_test_account('{P}',false)",
             f"select public.admin_set_maya_chat_family('{P}','rehearsal',false)",
             f"select public.admin_set_maya_chat_family('{P}','listed',false)"]

    if args.phase == "baseline":
        for table, sql in zip(["test_accounts", "maya_chat_families"], old):
            fixture()
            admin(a)
            # Stage the tuple lock that DELETE/UPDATE takes before its row trigger.
            a.execute("reset role")
            a.execute(f"select parent_id from public.{table} where parent_id='{P}' for update")
            a.execute("set local role authenticated")
            b.execute("begin")
            deletion = workers.submit(result, b, f"delete from auth.users where id='{P}' returning id")
            blocked(control, b, a)
            change = workers.submit(result, a, sql)
            # Deadlock detection can abort either session and releases that session's locks.
            outcomes = (change.result(), deletion.result())
            assert "40P01" in outcomes, (table, outcomes)
            a.execute("rollback")
            b.execute("rollback")
            assert "57014" not in outcomes
            print(f"PASS baseline: {table} vs Auth deletion = 40P01", flush=True)
    else:
        for sql in fixed:
            # Deletion owns the parent first. The admin must wait without holding the child row.
            fixture()
            b.execute("begin")
            b.execute(f"select id from public.parents where id='{P}' for update")
            admin(a)
            change = workers.submit(result, a, sql)
            blocked(control, a, b)
            b.execute(f"delete from auth.users where id='{P}'")
            b.execute("commit")
            answer = change.result()
            assert answer in ("", "ok", "not_listed"), (sql, answer)
            a.execute("commit")
            assert control.execute("select count(*) from public.maya_chat_families where parent_id=%s", (P,)).fetchone()[0] == 0
            print(f"PASS deletion first: {sql} -> {answer!r}", flush=True)
            # The admin owns the parent first. Auth deletion waits, then removes both rows.
            fixture()
            admin(a)
            answer = result(a, sql)
            assert answer in ("", "ok"), (sql, answer)
            b.execute("begin")
            deletion = workers.submit(result, b, f"delete from auth.users where id='{P}' returning id")
            blocked(control, b, a)
            a.execute("commit")
            assert str(deletion.result()) == P
            b.execute("commit")
            print(f"PASS admin first: {sql}", flush=True)

        competing = [fixed[0], f"select public.admin_set_maya_chat_family('{P}','rehearsal',true)"]
        for first, second in [(0, 1), (1, 0)]:
            fixture()
            control.execute("update public.maya_chat_families set rehearsal=false where parent_id=%s", (P,))
            admin(a)
            assert result(a, competing[first]) in ("", "ok")
            admin(b)
            change = workers.submit(result, b, competing[second])
            blocked(control, b, a)
            a.execute("commit")
            assert change.result() == ("not_test_family" if second == 1 else "")
            b.execute("commit")
            assert control.execute("select rehearsal from public.maya_chat_families where parent_id=%s", (P,)).fetchone()[0] is False
            assert control.execute("select count(*) from public.test_accounts where parent_id=%s", (P,)).fetchone()[0] == 0
            print(f"PASS simultaneous test removal/rehearsal change: order {first},{second}", flush=True)

        # Two eligible families compete for the one rehearsal place.
        fixture()
        control.execute("update public.maya_chat_families set rehearsal=false")
        admin(a)
        assert result(a, f"select public.admin_set_maya_chat_family('{P}','rehearsal',true)") == "ok"
        admin(b)
        change = workers.submit(result, b, f"select public.admin_set_maya_chat_family('{Q}','rehearsal',true)")
        blocked(control, b, a)
        a.execute("commit")
        assert change.result() == "taken"
        b.execute("commit")
        assert control.execute("select count(*) from public.maya_chat_families where rehearsal").fetchone()[0] == 1
        print("PASS simultaneous rehearsal uniqueness", flush=True)

    control.execute("truncate auth.users cascade; truncate public.admin_users")
    print("PASS synthetic fixture cleanup", flush=True)
    if args.phase == "fixed":
        control.execute((root / "supabase/tests/maya_admin_lock_order.sql").read_text())
        assert control.execute("select count(*) from auth.users").fetchone()[0] == 0
        print("PASS SQL rollback probe: permissions, actor ids, results, fence, cascade, no rows kept", flush=True)
