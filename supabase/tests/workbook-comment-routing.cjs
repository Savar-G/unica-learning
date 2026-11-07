// Isolated PostgreSQL proof. No service credentials, network database or hosted row is used.
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { execFileSync, execFile } = require("node:child_process");
const { promisify } = require("node:util");
const run = promisify(execFile);
const root = path.resolve(__dirname, "../.."), bin = process.env.WORKBOOK_TEST_PG_BIN || "/opt/homebrew/opt/postgresql@18/bin";
const work = fs.mkdtempSync(path.join(os.tmpdir(), "unica-comment-routing-")), data = path.join(work, "data"), socket = path.join(work, "socket");
fs.mkdirSync(socket, { mode: 0o700 });
const sqlArgs = ["-X", "-v", "ON_ERROR_STOP=1", "-h", socket, "-p", "5432", "-U", "postgres", "-d", "postgres"];
const sql = value => execFileSync(path.join(bin, "psql"), [...sqlArgs, "-At", "-c", value], { encoding: "utf8" });
function definition(file, name) {
  const source = fs.readFileSync(path.join(root, "supabase/migrations", file), "utf8");
  const match = new RegExp(`create(?: or replace)? function public\\.${name}\\(`, "i").exec(source);
  if (!match) throw new Error(`Missing function ${name}`);
  const end = source.indexOf("end $$;", match.index);
  if (end < 0) throw new Error(`Missing function end ${name}`);
  return source.slice(match.index, end + "end $$;".length);
}
(async () => {
  let started = false;
  try {
    execFileSync(path.join(bin, "initdb"), ["-D", data, "--username=postgres", "--auth=trust", "--no-locale", "--encoding=UTF8"], { stdio: "ignore" });
    execFileSync(path.join(bin, "pg_ctl"), ["-D", data, "-l", path.join(work, "postgres.log"), "-o", `-F -k ${socket} -c listen_addresses='' -p 5432`, "-w", "start"], { stdio: "ignore" });started = true;
    sql(fs.readFileSync(path.join(__dirname, "workbook-comment-routing-fixture.sql"), "utf8"));
    for (const [file, name] of [["20261102_workbook_edit.sql", "queue_workbook_edit"], ["20261102_workbook_edit.sql", "claim_workbook_edit"],
      ["20261102155653_workbook_comment_admin_keys.sql", "save_workbook_comment"], ["20261102_workbook_edit_recovery_checks.sql", "send_workbook_comments"],
      ["20261102_workbook_edit_recovery_checks.sql", "finish_workbook_edit"], ["20261102_workbook_edit_legacy_frame.sql", "frame_workbook_edit"]]) sql(definition(file, name));
    for (const file of ["20261107042155_workbook_comment_routing.sql", "20261107042201_workbook_layout_review.sql", "20261107051924_workbook_layout_repair_contracts.sql"]) {
      // Counterfactual: the same public tests must fail when only the new repair migration is absent.
      if (process.env.WORKBOOK_ROUTING_REPAIR_CONTROL === "prior" && file.endsWith("workbook_layout_repair_contracts.sql")) continue;
      sql(fs.readFileSync(path.join(root, "supabase/migrations", file), "utf8"));
    }
    const result = await run(path.join(bin, "psql"), [...sqlArgs, "-f", path.join(__dirname, "workbook-comment-routing.sql")]);
    console.log(result.stdout.trim());console.log(result.stderr.trim());
    // Both real sessions race through the same public admission function.
    const draft = sql("select public.qa_seed_book()").trim();
    sql(`select public.save_workbook_comment('${draft}',1,'{"page":1,"x":0.5,"y":0.5,"note":"Fix the cover"}','00000000-0000-4000-8000-000000000001','test@example.com',false)`);
    const comment = sql(`select id from public.workbook_comments where draft_id='${draft}'`).trim();
    const plan = JSON.stringify({ reviewed: true, build: "a".repeat(40), contentFingerprints: { 1: "c".repeat(64) }, pages: [1], results: [{ id: comment, page: 1, status: "applied", note: "Reviewed correction." }] });
    const query = `select public.queue_workbook_layout_edit('${draft}',1,'${plan}','00000000-0000-4000-8000-000000000001','test@example.com')`;
    const responses = await Promise.all([run(path.join(bin, "psql"), [...sqlArgs, "-At", "-c", query]), run(path.join(bin, "psql"), [...sqlArgs, "-At", "-c", query])]);
    const states = responses.map(r => JSON.parse(r.stdout.trim()).status).sort();
    if (JSON.stringify(states) !== JSON.stringify(["queued", "refused"])) throw new Error(`Concurrent admission: ${states}`);
    if (sql(`select count(*) from public.workbook_edits where draft_id='${draft}' and status='queued'`).trim() !== "1") throw new Error("Duplicate active batch");
    console.log("WORKBOOK_COMMENT_ROUTING_CONCURRENCY_OK 1");
    sql(fs.readFileSync(path.join(__dirname, "workbook-comment-routing-regressions.sql"), "utf8"));
    sql(definition("20261105_workbook_print_contract_lock.sql", "apply_workbook_print_contract"));
    sql(definition("20261104_workbook_print_contract.sql", "approve_workbook_draft"));
    const failures = [];
    for (const name of ["qa_check_stored_layout", "qa_check_outcome_promotion", "qa_check_repaired_problems", "qa_check_proof_repair", "qa_check_failed_repair_keeps_error", "qa_check_repaired_fit_metadata"]) {
      try { sql(`select public.${name}()`);console.log(`${name} PASS`); }
      catch (e) { failures.push(name);console.error(String(e.stderr || e.message).trim()); }
    }
    // Session B starts before expiry but must recheck the real clock after A releases the draft lock.
    const timing = JSON.parse(sql("select public.qa_layout_case(1,'applied')").trim());
    const app = `layout-expiry-${process.pid}`;
    const locker = run(path.join(bin, "psql"), [...sqlArgs, "-At", "-c", `set application_name='${app}';begin;select id from public.workbook_drafts where id='${timing.draft}' for no key update;select pg_sleep(2);commit;`]);
    let locked = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (sql(`select exists(select 1 from pg_stat_activity where application_name='${app}' and wait_event='PgSleep')`).trim() === "t") { locked = true;break; }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    if (!locked) throw new Error("Expiry test did not acquire the draft lock");
    sql(`update public.workbook_edits set heartbeat_at=clock_timestamp()-interval '5 minutes 59 seconds' where id='${timing.edit}'`);
    const elapsed = JSON.parse(sql(`select public.finish_workbook_layout_edit('${timing.edit}','${timing.lease}','${JSON.stringify(timing.rendering)}','${JSON.stringify(timing.results)}',null)`).trim());
    await locker;
    if (elapsed.status !== "refused" || sql(`select max(revision) from public.workbook_draft_revisions where draft_id='${timing.draft}'`).trim() !== "1") {
      failures.push("qa_check_expiry_after_lock");console.error("F3: finish accepted a lease that expired during the draft lock wait");
    } else console.log("qa_check_expiry_after_lock PASS");
    if (failures.length) throw new Error(`Review regressions failed: ${failures.join(", ")}`);
    console.log("WORKBOOK_COMMENT_ROUTING_REVIEW_REGRESSIONS_OK 7");
  } catch (e) {
    if (e.stderr) process.stderr.write(String(e.stderr));
    console.error(e.message);process.exitCode = 1;
  } finally {
    if (started) execFileSync(path.join(bin, "pg_ctl"), ["-D", data, "-m", "immediate", "-w", "stop"], { stdio: "ignore" });
    fs.rmSync(work, { recursive: true, force: true });
    console.log("Owned PostgreSQL cluster stopped and removed.");
  }
})();
