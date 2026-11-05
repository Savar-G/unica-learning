-- The sweep of abandoned Maya chats and calls (#528, src/lib/maya-call-sweep.ts) reads live calls oldest first every
-- 15 minutes. A partial index keeps that read small however many ended calls the table holds.
-- Additive: one new index, no data change.
create index if not exists maya_calls_live_idx on public.maya_calls (created_at, id) where status = 'live';
