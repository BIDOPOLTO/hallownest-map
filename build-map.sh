#!/usr/bin/env bash
set -euo pipefail
mkdir -p maps
printf 'window.HK_SKETCH_POS={};\n' > maps/sketch-positions.js

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
  i=$((i+1))
  [ "$i" -le 40 ] || break
  curl -fLsS --retry 2 --connect-timeout 10 --max-time 90 -A "$UA" -e "$PAGE" "$js" -o "$WORK/js_$i.txt" || true
done < "$WORK/scripts.txt"

python3 - "$WORK" <<'PY'
import sys,re,glob,json
work=sys.argv[1]
txt='\n'.join(open(f,encoding='utf-8',errors='ignore').read() for f in glob.glob(work+'/js_*.txt'))

# Extract screenshot -> sketch marker coordinate substitutions used by ScriptersWar.
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
    key=f'{float(x):.2f},{float(y):.2f}'
    out[key]=[float(x2),float(y2)]

open('maps/sketch-positions.js','w',encoding='utf-8').write(
    'window.HK_SKETCH_POS='+json.dumps(out,separators=(',',':'))+';\n'
)
print('Sketch marker positions:',len(out))

# Verify the exact progressive map sources we mirror in-browser.
for token in ('https://scripterswarmap.b-cdn.net/hk_v5/{z}_{x}_{y}.webp?v=1',
              'https://scripterswarmap.b-cdn.net/hk_sketch_v3/{z}_{x}_{y}.webp?v=1'):
    if token not in txt:
        raise SystemExit('Expected tile source missing: '+token)

print('ScriptersWar progressive tile sources verified.')
PY

echo "Map metadata build completed."
