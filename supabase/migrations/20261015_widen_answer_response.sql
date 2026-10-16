-- #165: a choice answer is stored as the choice text, and some choices are longer than 40 characters
-- ("A triangle with 3 equal sides and 3 equal angles" is 48). Widen the limit to 80, the RESPONSE_MAX of the
-- assessment core (src/lib/assessment/constants.ts). A bank test fails when a choice does not fit.
-- Only widens: every stored answer and the live code still fit.
alter table public.answers drop constraint answers_response_check;
alter table public.answers add constraint answers_response_check check (char_length(response) <= 80);
