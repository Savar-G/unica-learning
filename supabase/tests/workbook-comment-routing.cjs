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
      ["20261102_workbook_edit_recovery_checks.sql", "finish_workbook_edit"]]) sql(definition(file, name));
    for (const file of ["20261107033000_workbook_comment_routing.sql", "20261107033001_workbook_layout_review.sql"]) {
      sql(fs.readFileSync(path.join(root, "supabase/migrations", file), "utf8"));
    }
    const result = await run(path.join(bin, "psql"), [...sqlArgs, "-f", path.join(__dirname, "workbook-comment-routing.sql")]);
    console.log(result.stdout.trim());console.log(result.stderr.trim());
    // Both real sessions race through the same public admission function.
    const draft = sql("select public.qa_seed_book()").trim();
    sql(`select public.save_workbook_comment('${draft}',1,'{"page":1,"x":0.5,"y":0.5,"note":"Fix the cover"}','00000000-0000-4000-8000-000000000001','test@example.com',false)`);
    const comment = sql(`select id from public.workbook_comments where draft_id='${draft}'`).trim();
    const plan = JSON.stringify({ reviewed: true, build: "a".repeat(40), pages: [1], results: [{ id: comment, page: 1, status: "applied", note: "Reviewed correction." }] });
    const query = `select public.queue_workbook_layout_edit('${draft}',1,'${plan}','00000000-0000-4000-8000-000000000001','test@example.com')`;
    const responses = await Promise.all([run(path.join(bin, "psql"), [...sqlArgs, "-At", "-c", query]), run(path.join(bin, "psql"), [...sqlArgs, "-At", "-c", query])]);
    const states = responses.map(r => JSON.parse(r.stdout.trim()).status).sort();
    if (JSON.stringify(states) !== JSON.stringify(["queued", "refused"])) throw new Error(`Concurrent admission: ${states}`);
    if (sql(`select count(*) from public.workbook_edits where draft_id='${draft}' and status='queued'`).trim() !== "1") throw new Error("Duplicate active batch");
    console.log("WORKBOOK_COMMENT_ROUTING_CONCURRENCY_OK 1");
  } catch (e) {
    if (e.stderr) process.stderr.write(String(e.stderr));
    console.error(e.message);process.exitCode = 1;
  } finally {
    if (started) execFileSync(path.join(bin, "pg_ctl"), ["-D", data, "-m", "immediate", "-w", "stop"], { stdio: "ignore" });
    fs.rmSync(work, { recursive: true, force: true });
    console.log("Owned PostgreSQL cluster stopped and removed.");
  }
})();
