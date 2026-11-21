# Parent dashboard typography

The desktop and phone captures use the same invented fixtures on both versions. Aside rendered the repository’s Parent components on a local Next.js server at 1440 × 1000 and 390 × 844.

| View | Desktop | Phone | Phone detail |
| --- | --- | --- | --- |
| Overview, catching up | [Before](before-overview-catching-up-desktop.png) · [After](after-overview-catching-up-desktop.png) | [Before](before-overview-catching-up-phone.png) · [After](after-overview-catching-up-phone.png) | [Before](before-overview-catching-up-phone-detail.png) · [After](after-overview-catching-up-phone-detail.png) |
| Overview, on track | [Before](before-overview-on-track-desktop.png) · [After](after-overview-on-track-desktop.png) | [Before](before-overview-on-track-phone.png) · [After](after-overview-on-track-phone.png) | [Before](before-overview-on-track-phone-detail.png) · [After](after-overview-on-track-phone-detail.png) |
| Overview workbook ring follow-up | [Before](before-overview-ring-desktop.png) · [After](after-overview-ring-desktop.png) | [Before](before-overview-ring-phone.png) · [After](after-overview-ring-phone.png) | |
| Progress | [Before](before-progress-desktop.png) · [After](after-progress-desktop.png) | [Before](before-progress-phone.png) · [After](after-progress-phone.png) | [Before](before-progress-phone-detail.png) · [After](after-progress-phone-detail.png) |
| Workbooks | [Before](before-workbooks-desktop.png) · [After](after-workbooks-desktop.png) | [Before](before-workbooks-phone.png) · [After](after-workbooks-phone.png) | [Before](before-workbooks-phone-detail.png) · [After](after-workbooks-phone-detail.png) |

## Computed typography

| Example | Before | After |
| --- | --- | --- |
| Overview ring number | 18 px / 900 | 18 px / 300 |
| Ring label | 11.5 px / 600 | 11.5 px / 400 |
| Weekly lead | 15 px / 600 | 15 px / 500 |
| Skills and Math topics headings | 18 px / 300 | 20 px / 500 |
| Number concepts to 1000 | 17 px / 600 | 16 px / 500 |
| Workbook names in answer keys and older workbooks | 14.5 px / 600 | 16 px / 500 |
| Day row title | 16 px / 300 | 16 px / 500 |

The computed audit covered 128 renders, including empty, error, pending and completed states. It checked visible text weights, buttons, selects, disclosure controls and horizontal overflow. The audit opened day rows and child switchers where present. Live local fixtures also exercised switching the Progress period and opening a Scan results question. The screenshots and audit used invented data throughout.

## Overview workbook ring follow-up

The ring crops use the same invented 38% Overview fixture in Aside u0, with the PR's previous head as the baseline. Measurements were identical at 1440 × 1000 and 390 × 844.

| Measurement | Before | After |
| --- | --- | --- |
| `38%` size and weight | 18 px / 300 | 20 px / 400 |
| `38%` line height | 20.7 px | 23 px |
| `38%` text bounds | 35.55 × 23 px | 40.39 × 26 px |
| `38%` minimum clearance from the inner stroke | 10.51 px | 7.99 px |
| `done` size and weight | 11.5 px / 400 | 11.5 px / 400 |
| `done` minimum clearance from the inner stroke | 14.45 px | 13.51 px |

Clearance is measured from the farthest corner of each browser text bounding box to the inner edge of the stroke. Both lines fit within the 96 × 96 px ring. The full viewport captures had zero changed pixels outside the ring crop at both sizes.
