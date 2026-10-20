#!/usr/bin/env bash
set -u
mkdir -p tiles
BASE="https://scripterswarmap.b-cdn.net/hk_v4"
REF="https://scripterswar.com/hollowknight/map"

fetch_tile () {
  z="$1"; x="$2"; y="$3"
  out="tiles/${z}_${x}_${y}.png"
  [ -s "$out" ] && return 0
  url="$BASE/${z}_${x}_${y}.png?v=1"
  tmp="$out.tmp"
  if curl -fLsS --retry 2 --connect-timeout 10 --max-time 30 \
      -A "Mozilla/5.0" -e "$REF" "$url" -o "$tmp"; then
    mv "$tmp" "$out"
  else
    rm -f "$tmp"
  fi
}
export -f fetch_tile
export BASE REF

# Tile ranges covering the complete Hallownest community map.
# z=4 is the highest-resolution level cached locally; higher z values are progressively lighter.
for z in 4 5 6 7 8; do
  case "$z" in
    4) xmax=10; ymax=9 ;;
    5) xmax=5;  ymax=4 ;;
    6) xmax=3;  ymax=2 ;;
    7) xmax=2;  ymax=1 ;;
    8) xmax=1;  ymax=1 ;;
  esac
  jobs=0
  for x in $(seq 0 "$xmax"); do
    for y in $(seq 0 "$ymax"); do
      fetch_tile "$z" "$x" "$y" &
      jobs=$((jobs+1))
      if [ "$jobs" -ge 8 ]; then
        wait
        jobs=0
      fi
    done
  done
  wait
done

echo "Cached $(find tiles -type f -name '*.png' | wc -l) map tiles."
