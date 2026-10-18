#!/bin/zsh
# Renders every r251 screen with headless Chrome. Usage: zsh shoot.sh <out-dir> [variants] [screens] [name:w,h ...]
# Run from the round folder. Laptop 1280 x 800, tablet in portrait 820 x 1180.
R="${0:A:h}"
O="${1:-$R}"
VS=(${=${2:-A B C}})
SS=(${=${3:-intro resume extra question stress grid gridstress}})
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
mkdir -p "$O"
for v in $VS; do
  for s in $SS; do
    for vp in ${=${4:-laptop:1280,800 tablet:820,1180}}; do
      name=${vp%%:*}; size=${vp#*:}
      "$CH" --headless=new --disable-gpu --hide-scrollbars --allow-file-access-from-files --force-device-scale-factor=1 \
        --window-size=$size --virtual-time-budget=1500 --screenshot="$O/${(L)v}-$s-$name.png" "file://$R/mock.html?v=$v&s=$s" >/dev/null 2>&1
    done
  done
done
ls "$O"/*.png | wc -l
