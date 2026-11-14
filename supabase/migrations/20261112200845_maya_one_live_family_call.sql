-- At most one live family voice call per child (PR #904 review, P1). The desk's start reads the child's weekly voice
-- time and then inserts the call; two starts at the same moment could both read the same time left. With this index the
-- second insert fails, so a child's calls run one after another and each start reads the time of every earlier call
-- (a live call counts at its whole limit). Additive: no live family call exists when this is applied (checked 2026-11-12).
create unique index if not exists maya_calls_one_live_family_call on public.maya_calls (child_id) where kind = 'family' and status = 'live';
