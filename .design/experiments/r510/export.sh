#!/bin/bash
# Exports each ad at 1080x1350 from the local gallery (python3 -m http.server 4877, run from this folder).
# Chrome is used here because the Aside browser has a fixed 1440x900 window and cannot size a 1350 px tall capture.
cd "$(dirname "$0")"; mkdir -p png
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
for id in ${@:-k-program-first b2a-right-level-workbooks b2b-right-level-ruler b3-free-report n1-wrong-answer n2-price-compare c1-1-cover c1-2-assessment c1-3-workbook c1-4-maya c1-5-app}; do
  "$CH" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --window-size=1080,1350 --virtual-time-budget=5000 --user-data-dir=/tmp/adprev/prof --screenshot="$PWD/png/$id.png" "http://localhost:4877/index.html?only=$id" >/dev/null 2>&1
  sips -g pixelWidth -g pixelHeight "png/$id.png" | tail -2 | tr '\n' ' '; echo "$id"
done
