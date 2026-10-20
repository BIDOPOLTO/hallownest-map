#!/usr/bin/env bash
set -euo pipefail
mkdir -p maps
UA="Mozilla/5.0"
PAGE="https://scripterswar.com/hollowknight/map?image=sketch"
WORK="/tmp/hk-sw"
rm -rf "$WORK"
mkdir -p "$WORK"

echo "Fetching ScriptersWar map metadata..."
curl -fLsS --retry 3 --connect-timeout 15 --max-time 120 -A "$UA" "$PAGE" -o "$WORK/page.html"

python3 - "$WORK/page.html" "$PAGE" <<'PY' > "$WORK/scripts.txt"
import sys,re,html
from urllib.parse import urljoin,urlsplit
fn,base=sys.argv[1],sys.argv[2]
s=html.unescape(open(fn,encoding='utf-8',errors='ignore').read())
seen=set()
for src in re.findall(r'<script\b[^>]*\bsrc=["\']([^"\']+)["\']',s,re.I):
    u=urljoin(base,src.replace('\\/','/'))
    p=urlsplit(u)
    if p.scheme in ('http','https') and p.netloc and u not in seen:
        seen.add(u); print(u)
PY

i=0
while IFS= read -r js; do
  [ -n "$js" ] || continue
  case "$js" in http://*|https://*) ;; *) continue ;; esac
  if printf '%s' "$js" | grep -q '[{}<>[:space:]]'; then continue; fi
  i=$((i+1))
  [ "$i" -le 40 ] || break
  curl -fLsS --retry 2 --connect-timeout 10 --max-time 90 -A "$UA" -e "$PAGE" "$js" -o "$WORK/js_$i.txt" || true
done < "$WORK/scripts.txt"

python3 - "$WORK" <<'PY'
import sys,re,glob,json
work=sys.argv[1]
txt='\n'.join(open(f,encoding='utf-8',errors='ignore').read() for f in glob.glob(work+'/js_*.txt'))

# Screenshot -> Sketch marker coordinates.
pat=re.compile(
    r'"pos":\[\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]'
    r'(?:(?!"pos":).){0,2400}?'
    r'"uid":\s*(\d+)'
    r'(?:(?!"pos":).){0,2400}?'
    r'"pos2":\[\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]',
    re.S
)
out={}
for m in pat.finditer(txt):
    x,y,uid,x2,y2=m.groups()
    out[f'{float(x):.2f},{float(y):.2f}']=[float(x2),float(y2)]
open('maps/sketch-positions.js','w',encoding='utf-8').write(
    'window.HK_SKETCH_POS='+json.dumps(out,separators=(',',':'))+';\n'
)
print('Sketch marker positions:',len(out))

# Extract ScriptersWar's sparse tile allow-lists.
m=re.search(r'validImageSet\s*:\s*\[\s*"([^"]*)"\s*,\s*"([^"]*)"',txt,re.S)
if not m:
    m=re.search(r'"validImageSet"\s*:\s*\[\s*"([^"]*)"\s*,\s*"([^"]*)"',txt,re.S)
if not m:
    raise SystemExit('ERROR: could not extract ScriptersWar validImageSet arrays')

sets=[]
for raw in m.groups():
    vals=[v for v in raw.split(',') if re.fullmatch(r'\d+_\d+_\d+',v)]
    sets.append(vals)
if not sets[0] or not sets[1]:
    raise SystemExit('ERROR: extracted empty tile lists')

open(work+'/screenshot-tiles.txt','w').write('\n'.join(sets[0])+'\n')
open(work+'/sketch-tiles.txt','w').write('\n'.join(sets[1])+'\n')
print('Screenshot tile files:',len(sets[0]))
print('Sketch tile files:',len(sets[1]))
PY

download_tiles () {
  list="$1"
  folder="$2"
  base="$3"
  mkdir -p "$folder"
  export UA PAGE folder base
  xargs -r -P 16 -n 1 sh -c '
    key="$1"
    out="$folder/$key.webp"
    [ -s "$out" ] && exit 0
    tmp="$out.tmp"
    if curl -fLsS --retry 2 --connect-timeout 10 --max-time 90 -A "$UA" -e "$PAGE" "$base/$key.webp?v=1" -o "$tmp"; then
      mv "$tmp" "$out"
    else
      rm -f "$tmp"
      echo "FAILED TILE $base/$key.webp" >&2
      exit 12
    fi
  ' sh < "$list"
}

echo "Caching Screenshot tiles on our own Render site..."
rm -rf maps/hk_v5
download_tiles "$WORK/screenshot-tiles.txt" "maps/hk_v5" "https://scripterswarmap.b-cdn.net/hk_v5"

echo "Caching Sketch tiles on our own Render site..."
rm -rf maps/hk_sketch_v3
download_tiles "$WORK/sketch-tiles.txt" "maps/hk_sketch_v3" "https://scripterswarmap.b-cdn.net/hk_sketch_v3"

shot_expected="$(wc -l < "$WORK/screenshot-tiles.txt" | tr -d ' ')"
shot_got="$(find maps/hk_v5 -type f -name '*.webp' | wc -l | tr -d ' ')"
sk_expected="$(wc -l < "$WORK/sketch-tiles.txt" | tr -d ' ')"
sk_got="$(find maps/hk_sketch_v3 -type f -name '*.webp' | wc -l | tr -d ' ')"

echo "Screenshot cached: $shot_got / $shot_expected"
echo "Sketch cached: $sk_got / $sk_expected"
[ "$shot_got" = "$shot_expected" ] || { echo "ERROR: incomplete Screenshot tile cache"; exit 1; }
[ "$sk_got" = "$sk_expected" ] || { echo "ERROR: incomplete Sketch tile cache"; exit 1; }

echo "Local progressive maps ready."
