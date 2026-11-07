# State matrix

| State | Result | Local evidence or existing owner |
|---|---|---|
| Current and past books | Separate workbook/day groups; exact page links | History component and Workbooks route tests |
| Selected sibling | Only the selected child's book IDs enter history | Workbooks route and Admin preview tests |
| Child switch after a successful read | No old history in the new child's first committed view | Layout observer in history public-interface test |
| Late account, child, route or filter reply | Old reply is discarded | Deferred fake HTTP tests |
| Cursor change | Existing More pages and First pages request the cursor | Existing history test; keyed request context |
| Foreign family or child | Server refuses before history is composed | Workbooks route and existing history API tests; SQL source ownership check |
| Unexpected child or book in a success reply | Hide private results and stop requests | Fake HTTP response-scope tests |
| Loading | Loading page history status | History and Admin previews |
| Empty history | No saved page results | History and Admin previews |
| Empty filter | No saved page results for this filter | Deferred fake HTTP filter test |
| Missing old receipt/history | No saved results; no never-scanned claim | History presentation test; legacy no-row behavior remains canonical |
| Ready | Canonical right/scored count; existing result link | History presentation and Admin previews |
| Parent check | Please check; Continue checking | Existing history test and Admin previews |
| Pending | Waiting for a check | History presentation and Admin previews |
| Failed check | Could not check | History presentation and Admin previews |
| Blank | All answers blank and blank count | History presentation and Admin previews |
| Unscored | Not scored; no invented right count | History, result and correction tests |
| Expired photo | Existing result link; Photo no longer available | History, result and correction tests; Admin preview |
| Saved marks without a photo reference | Preserve counts without inventing a result URL | Admin missing-photo preview; existing reader remains unchanged |
| History read failure | Alert; existing poller may retry | Fake HTTP 503 test; Admin error preview |
| HTTP 401, 403 or 404 | No private links or filter; stop requests | Fake clock and HTTP refusal tests |
| Scan or marking gate closed | Unavailable; history loader is absent | Workbooks route tests; Admin closed preview |
| Sign-out or account replacement | Clear private history; stop old requests | Existing auth callback and late-reply test |
| Desk lock | Existing account layout and proxy guard | Existing proxy scan release tests; no guard edit |
| Parent correction or conflict | Existing item review and version fence | Existing scan-mark-change tests; implementation unchanged |
| Parent correction after photo expiry | Existing retained correction path | Existing scan-mark-change tests; implementation unchanged |
| Delivery unconfirmed | Whole answer key remains locked | Existing delivered-key and route tests |
| Delivery confirmed with no marked pages | Whole frozen key opens | Existing parent-workbook-answers tests; no history dependency |
| Explanation eligibility | Separate completed-page rule | Existing explanation and result tests; implementation unchanged |
| Admin sandbox | Static real components; no API, provider, action or analytics | Exhaustive Admin preview tests |
| Phone, desktop and long names | Existing cards, wrapping and 44-pixel controls | Static phone/desktop and child tests; root owns browser measurements |
| Keyboard, zoom, contrast and overflow | Existing focus and semantic tokens; no motion added | Source inspection only; root owns browser proof |

No local fake test proves live SQL permission behavior, a real device result or family approval.
