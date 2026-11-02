# Family postal time

Audited on 2026-11-01 for PR #425.

`familyZone` uses a valid stored `parents.time_zone` first, then the postal mapping, then the child's province, then Pacific. All family formatting and day or week calculations use `src/lib/family-time.ts` and its dated overrides, including stored browser zones. Fixed zones such as Creston and Regina keep their rules.

The postal mapping uses a province or territory default, then an FSA exception, then an exact full-code exception. It removes spaces and accepts lowercase input. Missing or malformed postal input falls through to the child's province, then Pacific. The postal-only `zoneFor` helper keeps its Pacific fallback for callers without family fields. It does not infer a place from five characters of a postal code.

The FSA choices serve most residents. A postal code is a delivery route, so an FSA can cross a time boundary. The source-linked tables in `src/lib/canada-postal-zones.ts` keep those choices and their exact-code exceptions together. New postal codes in a split FSA inherit its stated choice until a source identifies their community.

## Sources

- [tz database northamerica](https://raw.githubusercontent.com/eggert/tz/main/northamerica): provincial and territorial time rules and the named community exceptions. The file was read on the audit date.
- [Canada Post FSA list](https://canadapost-postescanada.ca/cpc/doc/en/support/kb/nps/NONLETTERMAIL_FSA_LIST_JULY_2026.pdf): FSA and province assignments. A mail processing facility does not establish the time at the destination.
- [Canada Post air stage offices](https://origin-www.canadapost.ca/cpc/en/support/articles/air-stage-offices/find-an-air-stage-office.page): exact community and FlexDelivery codes, including Saint-Augustin G0G 0C8.
- [Ontario road map 17](https://www.ontario.ca/files/2022-03/mto-orm-map17-2022-03-16.pdf): the observed Central boundary east of 90 W. The page image confirms that Big Trout Lake, Angling Lake, Kasabonika, Kingfisher Lake and Wunnumin Lake are on its Central side. Webequie, Summer Beaver and Lansdowne House are on its Eastern side.
- [Ontario Regulation 333/26](https://www.ontario.ca/laws/regulation/r26333): the permanent UTC-5 rule covers west of 90 W. It does not establish a change for the eastern Central communities.
- [BC time guidance](https://www2.gov.bc.ca/gov/content/governments/celebrating-british-columbia/daylight-saving-time), [East Kootenay](https://engage.rdek.bc.ca/timechange) and [Golden](https://www.golden.ca/town-hall/news-notices/no-time-change-weekend-golden): Pacific, permanent Mountain, and Creston rules.
- [BC fire department addresses](https://www2.gov.bc.ca/assets/gov/public-safety-and-emergency-services/public-safety/fire-safety/fire_dept_listing.pdf): full codes for Peace communities, Fort Nelson, Dease Lake and Creston Valley. [RDCK's Erickson project](https://rdck.ca/wp-content/uploads/2026/03/PRJ25030-2_ITT_ERK-Meter-Pits-ITT2_rev1.pdf) names Arrow Creek V0B 1G9 and Creston V0B 1G1.
- [Saskatchewan time system](https://www.saskatchewan.ca/government/municipal-administration/tools-guides-and-resources/saskatchewan-time-system) and [municipal directory](https://www.saskatchewan.ca/government/municipal-administration/municipal-directory): border-community history and postal addresses. Lloydminster follows Alberta. The historical border communities now share Saskatchewan's UTC-6. The tz file records Creighton and Denare Beach's practice of following Manitoba.

Each exact-code entry also carries its community source URL in the table.

## Split-region audit

| Province or territory | Default and exceptions |
| --- | --- |
| Newfoundland and Labrador | Newfoundland time. A0P, A0R and A2V use Goose Bay. A0K needs exact exceptions for Cartwright and Black Tickle. The southeast coast keeps Newfoundland time, including Port Hope Simpson and Mary's Harbour. |
| Nova Scotia | Seasonal Atlantic. No present split needs a postal exception. |
| Prince Edward Island | Seasonal Atlantic. No present split needs a postal exception. |
| New Brunswick | Seasonal Atlantic. Moncton preserves the local history. |
| Quebec | Eastern. G4T and Listuguj use seasonal Atlantic. The lower north shore east of 63 W uses UTC-4 without DST. G0G also contains Fermont and Havre-Saint-Pierre, which use Eastern. |
| Ontario | Eastern. Western FSAs use Winnipeg with the dated permanent UTC-5 override. Atikokan, Pickle Lake and Mishkeegogamang keep UTC-5. Upsala and Fort Severn keep Eastern. Eastern communities that observe Central keep seasonal Central. |
| Manitoba | Winnipeg with its dated permanent UTC-5 override. |
| Saskatchewan | Regina, UTC-6. Lloydminster and the historical Battle River communities follow Alberta. Creighton and Denare Beach follow Manitoba. |
| Alberta | Edmonton with its dated permanent UTC-6 override. |
| British Columbia | Pacific. East Kootenay and Golden follow Edmonton. Creston keeps UTC-7. Peace communities keep UTC-7 with their named historical zones. Dease Lake follows Pacific. |
| Northwest Territories | Yellowknife or Inuvik with the dated permanent UTC-6 override. X0G stays on the territorial default. |
| Nunavut | Eastern for X0A, seasonal Mountain for X0B, seasonal Central for X0C. Resolute uses seasonal Central. Coral Harbour keeps UTC-5. Eureka keeps Central standard time without DST, as recorded in northamerica. |
| Yukon | Whitehorse, UTC-7 all year. |

The seasonal Central entry uses `America/Chicago` with `override: false`. A runtime with new Winnipeg data must still keep that entry seasonal. Using Winnipeg with an override disabled would fail when the runtime's own Winnipeg data changes to permanent UTC-5.

## Known ambiguous FSAs

| FSA | Choice for a code without an exact exception | Exceptions |
| --- | --- | --- |
| A0K | St Johns | Cartwright and Black Tickle use Goose Bay. |
| G0C | Toronto | Listuguj uses Halifax. |
| G0G | Toronto | The lower north shore uses Blanc-Sablon. |
| P0T | Toronto | Ignace uses Winnipeg. Atikokan keeps UTC-5. |
| P0V | Winnipeg with the permanent-offset override | Pickle Lake and Mishkeegogamang keep UTC-5. Fort Severn uses Eastern. The eastern Central communities remain seasonal. |
| S0M | Regina | The historical Battle River communities follow Alberta. |
| S0P | Regina | Creighton and Denare Beach follow Manitoba. |
| V0B | Edmonton | Creston Valley and the Kootenay Lake east shore keep UTC-7 all year. |
| V0C | Dawson Creek | Dease Lake follows Pacific. Fort Nelson has a different historical zone. |
| X0A | Iqaluit | Resolute uses seasonal Central. Eureka keeps UTC-6. |
| X0C | Rankin Inlet | Coral Harbour keeps UTC-5. |

## Verification limits

Public-interface tests check January and November clocks for every reported case and each audited region. Summer probes distinguish Atlantic with and without DST, and Eureka from Resolute. A simulated updated runtime checks that eastern Ontario keeps seasonal Central. These checks do not make a postal directory complete. The known ambiguous FSA list states the remaining address-level limit.

The parent report reader reads `parents.postal` separately with the parent's session. It never uses `reports.parent_id`. The secret-key reader keeps its parent join. The admin reader keeps its admin RPCs. No grants or migrations change.

## Maya integration

The weekly recap uses the shared calendar functions for Monday 7 a.m. release, call-week grouping, the final Sunday and Monday-midnight expiry. The minutes ledger uses the same layer for Monday-midnight weekly resets and the separate 120-second daily demo cap. Parent home passes one resolved zone to its date labels and minutes reader. Browser-zone capture still writes once.

The weekly, reminder and report readers load the stored browser zone with the postal code. The parent report reader still reads its parent row separately under its session. No report parent join or new grant is needed.
