# Weekly blog post - runbook

The weekly cloud routine "Unica weekly blog" runs this file every Sunday. You run unattended: there is no
person to ask. Never use AskUserQuestion. Follow the steps in order. If a hard step fails, go to
"On failure" and stop. Commands run from the repo root.

How a post reaches the site: you push one post on a branch named `claude/blog-<slug>`. The GitHub
Actions workflow `Blog publish` (`.github/workflows/blog-publish.yml`) checks that the branch only adds
a post and registers it (`scripts/blog-publish-guard.mjs`), merges it into `main`, runs the done gate,
and pushes `main`. Vercel then deploys production. You never push to `main` yourself.

## Steps

0. **Install:** `npm ci --include=dev`. Set `TODAY=$(TZ=America/Vancouver date +%F)` in each shell
   block that needs the date (shell variables do not carry over between blocks).

1. **Read the contract.** Read `docs/blog-style.md` (binding), `src/lib/blog.ts`, the newest post in
   `src/content/blog/` (your template for the file shape), and the copy rules in `DESIGN.md` (the
   "No proof", "Comparative and performance claims" and competitor lines).

2. **Pick ONE topic** from `docs/blog-topics.md`:
   - Take the first row in the queue with status `todo`, from the top. Skip a row whose "Season" column
     names months that do not include this month or the next one; take the next row.
   - Check `src/lib/blog.ts` and `src/lib/resources.ts`: the slug must be new, and no post or guide may
     already answer the same main question. If one does, mark the row `skip (<reason>)` and take the next.
   - If no `todo` row is left, find a new topic with the method in the backlog's "Finding new topics"
     section, add it as a row, and use it.

3. **Research the topic (do not skip).**
   - Search the primary keyword on the web. Read the top 3-5 pages that rank. Note what they cover, what
     they miss, and anything US-only that does not fit Canadian parents.
   - Collect primary sources for every fact you will state: the BC Ministry of Education
     (curriculum.gov.bc.ca, gov.bc.ca), school districts, Statistics Canada, each provider's own pages for
     its prices and method, peer-reviewed research for any learning claim. Read each source page yourself.
   - A price or a rule that you cannot find on a source page does not go in the post.

4. **Write the post** to `src/content/blog/<slug>.tsx`, the same shape as the template:
   `meta` (BlogMeta) and a default `Body`. Set `published` and `updated` to `$TODAY`, and each source's
   `accessed` to `$TODAY`. Import only from `next/link`, `@/lib/blog` and `@/components/article`.
   Follow `docs/blog-style.md` for structure, voice and claims.

5. **Register it** in `src/lib/blog.ts`: add one `import * as <name> from "@/content/blog/<slug>";` line
   and add `<name>` to the `BLOG_MODULES` line. Change no other line (the publish guard rejects it).

6. **Mark the topic** in `docs/blog-topics.md`: set the row's status to `done $TODAY` and its post to
   `/blog/<slug>`.

7. **Edit like a strict editor.** Re-read the post as a busy parent. For each factual sentence, confirm
   that the cited source says it; cut or soften what it does not. Cut filler, repeated points and any
   sentence that sells. Check the title and description against the primary keyword. Build a short
   fact-check list ("<claim> - <source>") for your final message.

8. **Run the done gate:** `npm test && npx eslint src && npm run build`. Fix every failure inside your
   post file (or the two allowed registry lines) and run it again until it passes. Never change tests,
   other code or config to make it pass. If it still fails after 3 tries, go to "On failure".

9. **Publish:**
   ```bash
   SLUG=<slug>
   git checkout -b "claude/blog-$SLUG"
   git add "src/content/blog/$SLUG.tsx" src/lib/blog.ts docs/blog-topics.md
   git commit -m "Blog: $SLUG"
   git push -u origin "claude/blog-$SLUG"
   ```

10. **Confirm it went live (advisory, does not undo the push).** Every 60 seconds for up to 20 minutes,
    run `git fetch -q origin main && git log origin/main --oneline -5` and look for
    "Blog: publish claude/blog-<slug>". When it appears, wait 3 minutes for the Vercel deploy, then
    `curl -s -o /dev/null -w '%{http_code}' https://unicalearning.com/blog/<slug>` every 60 seconds for up
    to 10 minutes until it returns 200. If the merge never appears, the workflow failed: say so in the final
    message with the branch name, so Savar can open the failed run in GitHub Actions.

11. **Final message** (the routine's notification): the post title, its URL, the topic row and why it was
    picked, the fact-check list, and the live check result (live, pending, or workflow failed).

## On failure

Do not push a half-written post. Leave the branch unpushed. End with a final message that starts with
"Blog run FAILED:", the step, and the error text. Change nothing on `main`.
