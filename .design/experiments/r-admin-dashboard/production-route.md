# Production Admin dashboard route

Savar requested https://unicalearning.com/admin/dashboard. This is now the canonical Admin explorer address. The Admin navigation uses it. The old /admin/parent-dashboard page reuses the same authenticated component and preserves old view links. Selection changes use the canonical address.

Both addresses require the existing verified Admin session. No demo request can bypass authorization. Both remain excluded from site analytics, speed events and ad/visit effects. The synthetic iframe and its sandbox are unchanged. No family dashboard or marking switch changed.

Before the correction, three public-interface checks failed: the control navigation used the old route, and the new route started analytics/ad effects and was not scrubbed from previously loaded analytics. After the correction,134 tests passed across 4 files. Source lint and the normal build exited 0. The build lists both dynamic routes.

Browser: Google sign-in on localhost:3000 returned through the real callback to /admin/dashboard with HTTP 200. The Admin link uses the canonical address. View selection changed to Overview. The legacy address opened the expired scan result for Kai. Changing its scenario returned to the canonical address with all selection fields retained. The preview body had zero active form/navigation controls. Three head links were stylesheets. An incognito request with demo=1 received 404 and no preview. These checks use the normal local server and hosted Auth/Admin check. They do not prove production deployment. Snapshot capture timed out; no new screenshot was produced. Both opened tabs and both owned development servers were closed. The structured browser record is production-route-browser.json.

The full gate and a fresh independent review remain required before push/merge. Main merge order is 674, 673, 642, 624, 667, as confirmed by the other controller. Paid calls remain prohibited. Reported root paid spend is USD 0. No Auth configuration, Admin role, customer billing or family release changed in this route repair.
