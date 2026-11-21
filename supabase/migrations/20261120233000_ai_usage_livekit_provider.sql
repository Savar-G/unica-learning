-- D-349: Maya's turn model runs on LiveKit Inference. Its usage rows carry provider 'livekit'. Additive: the check
-- allows one more value; no row changes.
alter table public.ai_usage_events drop constraint ai_usage_events_provider_check;
alter table public.ai_usage_events add constraint ai_usage_events_provider_check
  check (provider in ('openrouter', 'anthropic', 'subscription', 'livekit'));
