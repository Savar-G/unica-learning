# Voice close records (#992)

The cause of the old f251 call remains unknown. The records at source pin
255056c138abed83dacf86473d5ce4b45e0f2f98 cannot distinguish an explicit
`maya.hang_up` RPC from a `CLIENT_INITIATED` participant disconnect. Both paths
save `hang_up` and `child_stopped`. SDK `user_initiated` does not prove a button
press. This change adds evidence for a future authorized capture. It does not
repair a proved behavior fault or remove the family voice hold.

The worker writes `close_origin` through its existing telemetry log. Each event
has a call ID, worker ID, immutable segment, sequence, time, close ID, entry,
closed reason and phase. The first initiating input has phase `origin`. Later
inputs have phase `observation` and reference that origin ID. `media_close`
marks the boundary before `session.close()`. A dropped connection first records
an observation. It becomes an origin only if its grace period ends. A new run
has a separate origin, even if it uses the same telemetry registry.

Entries distinguish the explicit RPC, participant disconnect, SDK close or
error, deadline, worker shutdown, controller end, other finish and stand-down.
Unknown reasons become `unknown`. No raw error text enters these records.
A recoverable SDK error is only an observation. A controller silence close has
reason `no_response`. A deadline has reason `time_limit`. Each run can write at
most 32 close events. The existing telemetry event limit also applies.

The browser uses the existing tab-local trace and browser clock. Each mark has
its room's call and attempt IDs. The trace records the Hang up button, the
hang-up request, RPC begin and end, component close, call replacement, page
lifecycle events and SDK reconnect or disconnect events. A page lifecycle mark
records the observed event. It does not assert that the page closed. A reconnect
mark does not assert human intent. The trace keeps the last 400 marks. It sends
no diagnostic request. A late RPC or room callback keeps its original identity.

These records contain no transcript, audio, URL, token or raw provider error.
A failed observer cannot stop media closure. All existing close outcomes,
reconnect behavior and grace periods remain the same. Local tests use fake
media and transport boundaries. They do not prove hosted signaling or select
the historical cause. A future live capture requires separate authorization.
