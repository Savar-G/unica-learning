# AI answer check: prompt map

Date: 2026-11-11. Engines: ChatGPT (Temporary Chat, "Unpersonalized", Instant), Perplexity (not signed in), Google Search (gl=ca, hl=en, signed-in browser, results showed Vancouver/Surrey location). 20 prompts x 3 engines. Raw data: `geo/raw/`, table: `geo/prompt-map.csv`.

## Summary table

M = Unica Learning named in the answer, C = a unicalearning.com URL among sources/results, M+C = both, - = neither, blocked = engine refused (Perplexity anonymous usage wall).

| # | Prompt | ChatGPT | Perplexity | Google |
|---|---|---|---|---|
| 1 | best math program for kids in BC | - | - | - |
| 2 | Kumon alternatives in Vancouver | - | - | - |
| 3 | how much does Kumon cost in BC | - | - | C |
| 4 | Mathnasium vs Kumon Vancouver | - | - | - |
| 5 | personalized math workbooks for kids in Canada | - | - | - |
| 6 | cheaper alternative to a math tutor in Vancouver | - | - | - |
| 7 | my grade 3 child is behind in math in BC, what can I do | - | blocked | - |
| 8 | free online math assessment for kids in Canada | M+C | M | M+C |
| 9 | math workbook subscription mailed home Canada | M+C | M | - |
| 10 | math help for kids in Surrey BC | - | blocked | - |
| 11 | what does emerging mean on a BC report card for math | - | blocked | C |
| 12 | what does my child learn in grade 4 math in BC | - | blocked | - |
| 13 | how can I help my child with math at home in BC | - | - | - |
| 14 | is Spirit of Math worth it | - | - | C |
| 15 | math program for kids with low screen time Canada | - | - | - |
| 16 | paper based math program for kids Canada | - | - | - |
| 17 | Unica Learning reviews | M+C | - | M+C |
| 18 | what is Unica Learning | M+C | M+C | M+C |
| 19 | Unica Learning vs Kumon | M | M | M+C |
| 20 | learning centre cost per month in Vancouver for math | - | C | M+C |

Totals (answered prompts only): chatgpt: 20 answered, mentioned 5, cited 4; perplexity: 16 answered, mentioned 4, cited 2; google: 20 answered, mentioned 5, cited 8

Google "M" counts only the AI Overview text. A unicalearning.com organic result counts as C (rank noted in the CSV). Unica ads or the Google Ads summary box in the viewer's own browser are not counted.

## 15 most-cited third-party URLs (all answers, all engines)

Count = number of answers (prompt x engine) that listed the URL as a source or top-5 organic result. unicalearning.com excluded. Google counts include AI Overview sources and top 5 organic.

| # | Count | URL |
|---|---|---|
| 1 | 5 | https://jumpmath.org/ca |
| 2 | 4 | https://jumpmath.org/ca/parents-guardians |
| 3 | 3 | https://kidsservicehub.com/kids-tutoring-vancouver-bc |
| 4 | 3 | https://mathletics.com/ca/for-home |
| 5 | 3 | https://superprof.ca/lessons/mathematics/vancouver |
| 6 | 3 | https://unifysocial.ca/blog/unica-learning-math-help-newcomer-parents (Savar's own Unify Social blog) |
| 7 | 3 | https://mathletics.com/ca |
| 8 | 2 | https://sfu.ca/wwest/resources/K-12YouthResources.html |
| 9 | 2 | https://mathnasium.com/ca/vancouver-math-tutors |
| 10 | 2 | https://ocnjdaily.com/news-from-our-partners/top-7-tutoring-services-in-vancouver-for-elementary-and-high-school-students |
| 11 | 2 | https://brighterly.com/blog/kumon-alternatives |
| 12 | 2 | https://vancouverguardian.com/top-5-best-tutors-for-your-child-in-canada |
| 13 | 2 | https://reddit.com/r/NorthVancouver/comments/1xaf019/math_tutor |
| 14 | 2 | https://kumon.com/vancouver-cedar-cottage-bc/aboutcenter |
| 15 | 2 | https://tutero.com/us/blog/mathnasium-vs-kumon |

Top domains: kumon.com (26), jumpmath.org (13), reddit.com (11), mathnasium.com (9), curriculum.gov.bc.ca (8), amazon.ca (7), ucmas.ca (6), mathletics.com (6), superprof.ca (6), thinkacademy.ca (6), mathmammoth.com (5), spiritofmath.com (4)

## Wrong facts about Unica (engine, prompt)

- **perplexity, prompt 8 ("free online math assessment for kids in Canada")**: Says assessment is for "ages 6-12" (truth: ages 5-14, K-Grade 9); cites the unifysocial.ca blog post
- **perplexity, prompt 9 ("math workbook subscription mailed home Canada")**: Says grades 1-7 / ages 6-12 (truth: K-Grade 9, ages 5-14); cites the unifysocial.ca blog post
- **perplexity, prompt 17 ("Unica Learning reviews")**: Answer is about other products (Unica Online Learning app, HCL Unica); Unica Learning not named
- **google, prompt 17 ("Unica Learning reviews")**: Conflates Unica Learning with the unrelated "Unica Online Learning" app (2.8 stars) and HCL Unica; not a fact error about Unica itself but wrong-entity reviews
- **chatgpt, prompt 18 ("what is Unica Learning")**: Says parents scan pages "using an app" (truth: phone camera on the Unica website, nothing to install)
- **perplexity, prompt 18 ("what is Unica Learning")**: Says parents scan "in the Unica app" (truth: website, no install); says a parent can start a voice call with the Teaching Assistant (truth: voice not open yet; chat only, Grade 3+)
- **google, prompt 18 ("what is Unica Learning")**: Says "for K-12 students" (truth: K-Grade 9)
- **chatgpt, prompt 19 ("Unica Learning vs Kumon")**: Says marking is "App-based" (truth: scan on the website, no app)
- **perplexity, prompt 19 ("Unica Learning vs Kumon")**: Says ages 6-12 / grades 1-7 (truth: K-Grade 9, ages 5-14); says "parent app" for marking (truth: website scan); says AI assistant explains "by voice and shared board" (truth: chat only, Grade 3+, voice not open)
- **google, prompt 19 ("Unica Learning vs Kumon")**: Says "ages 6-12" (truth: 5-14)
- **google, prompt 20 ("learning centre cost per month in Vancouver for math")**: Says at-home paper workbook programs "cost around $99 per month" for Unica (truth: CAD 79.99, first month free)

## Observations

1. **Unica shows up only when the prompt is narrow or names it.** Mentioned: free online assessment (8: ChatGPT, Perplexity, Google), mailed workbook subscription (9: ChatGPT, Perplexity), the three brand prompts (17-19), and Google AI Overview on 20. Zero mentions on the 10 broad discovery prompts (1, 2, 4, 5, 6, 7, 10, 13, 15, 16), including "personalized math workbooks for kids in Canada" (5) and "paper based math program" (16), where Unica fits best.
2. **Google ranks Unica's own guides but the AI Overview ignores them.** unicalearning.com is an organic result for 3 (kumon-cost-bc), 11 (emerging on a report card), 14 (is Spirit of Math worth it), 20 (tutor-cost-bc) and 8, 17-19, yet only 8 and 17-20 get named in the AI Overview. Perplexity cited tutor-cost-bc for 20 without naming Unica. These resource pages are the working entry point.
3. **Stale or wrong facts trace to a few sources.** "Ages 6-12 / grades 1-7" appears in Perplexity 8, 9, 19 (Perplexity cited the Unify Social blog post unifysocial.ca/blog/unica-learning-math-help-newcomer-parents for these claims; check what that post says) and in Google 19; the ended Google Ads copy also says "ages 6-12". "App" and "voice" claims appear in Perplexity 18/19 and ChatGPT 18/19 (truth: phone scan on the website, chat only, Grade 3+). Google 18 says K-12 and Google 20 says "$99 per month". Fix the blog post and ad text first.
4. **"Unica Learning reviews" is an entity problem.** Perplexity (17) answers only about the Unica Online Learning app (2.5 stars) and HCL Unica; Google AI Overview (17) mixes Unica Learning with the app's 2.8-star rating. ChatGPT (17) names the right company and says no independent reviews exist. Independent third-party pages about Unica are the gap.
5. **Engine behaviour.** ChatGPT (Instant, temporary chat) showed no sources on 9 of 20 prompts, so cited-rate there depends on whether it searches. Perplexity stopped answering (anonymous usage wall) on prompts 7, 10, 11, 12 after several retries over about 2 hours. In the pages cited most, kumon.com (26 answers), jumpmath.org (13), reddit.com (11), mathnasium.com (9), curriculum.gov.bc.ca (8), amazon.ca (7) and ucmas.ca (6) lead; the long tail is flat (no single third-party URL appears in more than 5 answers), so the targets are domains and directories, not one page.
6. **Method caveats.** Google ran in Savar's signed-in browser (location Vancouver/Surrey; his Google Ads summary box appeared and was ignored). ChatGPT ran Unpersonalized, Instant; its setting was reset to Personalized/High afterwards. Brand lists come from a fixed list of about 60 names.
