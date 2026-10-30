-- The child profile's build token (#303, review R345-2): a random token that each stored build gets, so a rebuild
-- stores its build only over the build it read (compare and set on the token). The revision alone cannot do this: a
-- test deletion deletes the profile built on it (on delete cascade), and the next build starts again at revision 1, so a
-- rebuild that read the deleted row's revision 1 would match the new row. A new random token never matches an older
-- one. The revision stays, for display.
-- Additive: the default gives every stored row a token, and the code on main does not read or write the table.
alter table public.child_profiles add column build_token uuid not null default gen_random_uuid();
alter table public.child_profiles add constraint child_profiles_build_token_key unique (build_token);
