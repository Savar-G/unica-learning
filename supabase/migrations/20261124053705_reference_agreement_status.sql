-- UNI-150: allow agreement_accepted in bank_reference_images.transcript_status.
alter table public.bank_reference_images
  drop constraint if exists bank_reference_images_transcript_status_check;

alter table public.bank_reference_images
  add constraint bank_reference_images_transcript_status_check
  check (transcript_status in ('machine_read', 'agreement_accepted', 'double_read', 'human_checked'));
