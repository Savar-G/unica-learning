#!/bin/zsh
# Prints the smallest tappable step or tile (width x height, CSS px) for each variant, screen and viewport.
R="${0:A:h}"
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
for v in A B C; do
  for s in question stress grid gridstress; do
    for size in 1280,800 820,1180; do
      m=$("$CH" --headless=new --disable-gpu --allow-file-access-from-files --window-size=$size --virtual-time-budget=1500 --dump-dom "file://$R/mock.html?v=$v&s=$s" 2>/dev/null | sed -n 's/.*data-min="\([^"]*\)".*/\1/p')
      print "$v $s $size $m"
    done
  done
done
