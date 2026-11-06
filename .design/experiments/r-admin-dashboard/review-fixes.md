# Review fixes

Source: 8b99d32cfc5dbffad0e8da87db7a8f6189685e81 on site/admin-parent-dashboard.
Computer: Savars-MacBook-Pro-5.local. Base: 0d9285c7d1635cff8bbf569ad17eb0608fd3a300.

S1 | P2 / should | resolved. Each optional Plan view slot now receives its own row. The preview constructs the control from that row's childName and cardId. Cancellation uses that row's childName. The normal parent route supplies neither slot and keeps its existing controllers.

S2 | P2 / should | resolved. The preview puts the selected synthetic child first in the Scan component's input list. This uses the existing initialization rule. The normal scan route and controller are unchanged.

Binding checks: six Pause/Restart/Cancel cases cover both selected children and both plan rows. Twelve Scan cases cover all six scenarios with both selected children. Before the fix, 12 cases failed and 104 passed. After the fix, all 152 focused checks passed across five files. The full current-main gate passed 16,746 tests with one optional skip across 447 files in 408.43 seconds. Source lint and build exited zero. No test expectation was weakened.

The authenticated browser then exercised the real Admin route. With Kai selected, Leah's Plan row showed Pause Leah's plan and Kai's row showed Pause Kai's plan. Both cancellation names matched their rows. Scan's Empty and Ready cases selected Kai. Changing the Admin child selector to Leah changed both the shell and Scan selection to Leah. Changing back selected Kai in both places. The recorded six states are in two-child-browser.json. The observed preview navigation made five GET requests and zero mutations. The frame retained allow-same-origin only, zero scripts, zero forms and zero enabled controls. The whole-document href count includes its stylesheet links; navigation URL removal is separately covered by the unchanged sanitizer checks.

The three new PNGs are captures of the authenticated shared-browser app. The shared browser does not support file URLs. Two attempted Aside local-file captures were refused by its local-file access boundary. Root used the actual app for the final proof. No file-access setting or browser profile changed. Standalone static-render output was not used as authenticated proof.

The temporary Admin identity was created only for this check. Its session was revoked, its Admin row and Auth user were removed, and the private ledger/key files were deleted. The owned browser tab and development process were closed. No family record, provider call, release flag, billing setting or paid acceptance changed.

Round two checks only S1, S2 and the changed code. The original authorization, isolation and 93-scenario review remains supplied evidence. Usage was not exposed. No finding was declined.

Final recheck: APPROVE at 03976eb1. S1 and S2 are resolved. The reviewer passed 138 affected tests and 50 independent checks, including 16 per-row names, 12 card associations, the normal parent Plan page and 36 Scan selections. Current main then added PR669. The branch was rebased to 3855e203. The reviewed Admin source files remain identical. At 1676fe28, the combined full gate passed 16,785 tests with one optional skip across 448 files in 327.39 seconds. Source lint and build exited zero. No provider or paid acceptance changed.
