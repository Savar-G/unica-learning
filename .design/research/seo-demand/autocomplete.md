# Google autocomplete demand (Canada) - 2026-10-09

Source: `suggestqueries.google.com` with `gl=ca&hl=en`, 30 seeds, each seed plus a-z suffixes. 5,806 unique suggestions in `ac.jsonl`.
Suggestions are geolocated to the request IP (Metro Vancouver), so local names (Surrey, Langley) show up.
Autocomplete shows that people search a phrase. It does not give volume. Rank in the list is a weak popularity signal.

## Clusters, strongest first

### 1. Grade + province curriculum (best fit)
- Every grade seed returns a BC curriculum query in its top 10: `grade 3 math bc curriculum`, `grade 2 math curriculum bc`, `grade 4 math curriculum bc worksheets`, `grade 5 math curriculum bc`.
- `bc math curriculum` completes to grade 2-10 by itself. Ontario and Alberta do the same (`ontario math curriculum grade 3`, `alberta math curriculum grade 4`, `alberta math curriculum changes`, `alberta curriculum vs ontario curriculum`).
- Paired with `worksheets`, `pdf`, `questions`, `sheets` - parents want practice that matches the curriculum.

### 2. Grade-level assessment (direct fit with the free placement assessment)
- `grade 2 math assessment`, `grade 4 math assessment`, `grade 2 end of year math assessment pdf`, `grade 2 math diagnostic test pdf`, `grade 5 math test`.

### 3. Worksheets / workbooks / practice by grade
- `math workbook grade 1..5`, `math practice for grade 1..7`, `workbooks for 1st/3rd graders`, `summer workbooks for 2nd/3rd/4th grade` (seasonal: publish by May).
- `reading practice for grade 1/2`.

### 4. "Is it worth it" / alternatives to learning centres
- `is kumon worth it`, `is kumon expensive`, `is kumon bad for mental health`, `kumon alternatives canada`, `alternative to kumon reading`, `kumon vs mathnasium cost`, `how much does mathnasium cost`, `does kumon qualify for tax credit`.
- Copy rule in DESIGN.md: no competitor names. These queries need a generic page (learning centre vs tutor vs workbooks) or a rule exception from Savar.

### 5. Tutoring cost
- `tutoring cost per hour`, `tutoring costs for elementary students`, `tutoring cost per month`, `tutoring cost tax deductible`, `elementary tutoring cost`.

### 6. My child is behind / struggling
- `my child is behind in reading how can i help`, `my child is struggling with maths`, `my child is struggling in school what do i do`, `my child is behind in school what can i do`.
- `how to help my child with reading comprehension / spelling / phonics at home / division`.

### 7. Reading tutor by age
- `reading tutor for 6 year old`, `reading tutor for 5 year old`, `reading tutors for kids near me`, `tutor for grade 1`.

## BC-only pass (scope: BC parents only, per Savar 2026-10-09)
Second run, 15 BC seeds, 1,092 suggestions in `ac_bc.jsonl`. Ontario and Alberta are out of scope.

- **FSA:** `fsa grade 4 math practice test`, `fsa grade 4 practice test`, `fsa grade 4 sample`, `fsa grade 4 bc`, `fsa bc school rankings`. FSA runs in grades 4 and 7.
- **Proficiency scale (report cards):** `bc proficiency scale for parents`, `proficiency scale bc to percentage`, `proficiency scale bc to letter grades`, `bc proficiency scale conversion chart`, `bc report card examples`. The conversion queries suggest parents want to translate the 4-point scale (Emerging, Developing, Proficient, Extending) into grades they know. Unverified until the Reddit pass.
- **Curriculum by grade:** `bc curriculum grade 1..7`, `bc grade 7 math curriculum`, `bc grade 7 math worksheets`, `bc reading curriculum`, `bc reading performance standards`.
- **Local tutoring:** `tutor vancouver bc`, `math tutor surrey`, `tutoring rates vancouver`, `math tutor rates near me`, `math tutor how much`, `best math tutor in burnaby`.
