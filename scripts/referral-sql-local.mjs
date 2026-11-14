// Local PostgreSQL semantics only. Hosted schema and trigger behavior require the separate rolled-back probe.
import { readFile } from "node:fs/promises";
import { referralSqlFixture } from "./referral-sql-fixture.mjs";
const db = await referralSqlFixture();

try {
 await db.exec(await readFile('supabase/tests/referrals_rollback.sql','utf8'));
 const counts = await db.query('select (select count(*) from parents) parents,(select count(*) from referral_rewards) rewards');
 if (counts.rows.some(r => r.parents !== 0 || r.rewards !== 0)) throw Error('Synthetic transaction did not roll back');
 console.log('REFERRAL_SQL_LOCAL_PASS: migration and synthetic rollback probe; stub platform fences, no hosted proof');
} catch (e) { console.error("REFERRAL_SQL_LOCAL_FAIL",e.message,e.where ?? ""); process.exitCode=1; } finally { await db.close(); }
