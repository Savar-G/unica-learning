-- Applied to project "pagewise" (cdjobwsyzndtltzfpyqa) as migration learning_events_transfer_questions, 2026-11-20
-- (Management API, registry 20261120185634).
-- #1144 (spec #1137, section 5): a Maya call can end with an optional related question that code generates (for 52 - 28,
-- the related question is 63 - 27). Its result gets its own learning event, apart from the call's question.
--
-- A related question is never labelled as the workbook or assessment question: its row has question_source
-- 'transfer' and no workbook or assessment columns. related_event_id links it to the learning event of the call's
-- question, of the same child (composite foreign key), and evidence_kind / evidence_id link it to the call.
-- generated_question is the related question's text ("63 - 27 = ?"). assistance is the help the child had on it:
-- independent, hinted, demonstrated, or uncertain (some voice help may have played, but no source confirmed it).
--
-- Additive: three nullable columns, one unique constraint on columns that are already unique (the primary key with one
-- more column), which the composite foreign key needs, and two widened checks. Every stored row keeps its meaning and
-- passes the new checks; code that never writes a related question works as before. Deletion needs no change: a family
-- deletion removes the rows through the parent and child foreign keys, and deleting the call question's event (for
-- example, a test deletion through the assessment foreign key) removes its related event (on delete cascade). The
-- append-only trigger refuses updates only.
alter table public.learning_events add constraint learning_events_id_child_key unique (id, child_id);

alter table public.learning_events
  add column related_event_id uuid,
  add column generated_question text check (length(generated_question) between 1 and 80),
  add column assistance text check (assistance in ('independent', 'hinted', 'demonstrated', 'uncertain')),
  add constraint learning_events_related_event_fkey foreign key (related_event_id, child_id)
    references public.learning_events (id, child_id) on delete cascade;

alter table public.learning_events
  drop constraint learning_events_question_source_check,
  add constraint learning_events_question_source_check check (question_source in ('workbook', 'assessment', 'transfer'));

alter table public.learning_events
  drop constraint learning_events_check,
  add constraint learning_events_check check (
    (question_source = 'workbook' and workbook_id is not null and workbook_page is not null and workbook_question is not null
      and assessment_id is null and assessment_question_id is null)
    or (question_source = 'assessment' and assessment_id is not null and assessment_question_id is not null
      and workbook_id is null and workbook_page is null and workbook_question is null)
    or (question_source = 'transfer' and workbook_id is null and workbook_page is null and workbook_question is null
      and assessment_id is null and assessment_question_id is null)
  );

-- A related question comes only from a call, always names the call's question event, its own text and its help.
alter table public.learning_events add constraint learning_events_transfer_check check (
  ((question_source = 'transfer') = (related_event_id is not null))
  and ((question_source = 'transfer') = (generated_question is not null))
  and (question_source <> 'transfer' or (source = 'call' and evidence_kind = 'call' and assistance is not null))
);

create index learning_events_related_idx on public.learning_events (related_event_id) where related_event_id is not null;
