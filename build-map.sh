#!/usr/bin/env bash
set -u
mkdir -p maps
printf 'window.HK_HD_MAP={"available":false};\n' > maps/map-quality.js

echo "Downloading Sketch map..."
curl -fLsS --retry 3 --connect-timeout 15 --max-time 120 \
  -A "Mozilla/5.0" \
  "https://raw.githubusercontent.com/sadabx/hallownest-tracker/main/public/assets/maps/hallownest-clean.webp" \
  -o maps/hallownest-sketch.webp
[ -s maps/hallownest-sketch.webp ] || { echo "ERROR: Sketch download failed"; exit 1; }

resolve_mediafire () {
  page="$1"
  html="$(curl -LsS --retry 2 --connect-timeout 15 --max-time 90 -A 'Mozilla/5.0' "$page" || true)"
  printf '%s' "$html" | grep -oE 'https://download[^"]+\.png[^"]*' | head -n1 | sed 's/&amp;/\&/g'
}

echo "Downloading 12.5% screenshot fallback..."
LOW_PAGE="https://www.mediafire.com/file/jmwvqizn8ldfp0f/Combined%252B12.5%2525.png/file"
LOW_URL="$(resolve_mediafire "$LOW_PAGE")"
rm -f maps/hallownest-screenshot.png
if [ -n "$LOW_URL" ]; then
  curl -fLsS --retry 2 --connect-timeout 15 --max-time 300 \
    -A "Mozilla/5.0" -e "$LOW_PAGE" "$LOW_URL" \
    -o maps/hallownest-screenshot.png || true
fi
[ -s maps/hallownest-screenshot.png ] || { echo "ERROR: screenshot fallback unavailable"; exit 1; }
echo "Fallback screenshot downloaded: $(du -h maps/hallownest-screenshot.png | cut -f1)"

echo "Resolving official Hallownest 100% world map (72,622 x 48,128; 835.61 MB)..."
rm -f /tmp/hallownest-hd.png /tmp/hallownest-downloads.json

fetch_downloads_json () {
  curl -fLsS --retry 2 --connect-timeout 15 --max-time 90 -A "Mozilla/5.0" \
    "https://www.hallownest.net/wp-json/wp/v2/pages?slug=downloads&_fields=content" \
    -o /tmp/hallownest-downloads.json && return 0
  curl -fLsS --retry 2 --connect-timeout 15 --max-time 90 -A "Mozilla/5.0" \
    "https://www.hallownest.net/?rest_route=/wp/v2/pages&slug=downloads&_fields=content" \
    -o /tmp/hallownest-downloads.json && return 0
  curl -fLsS --retry 2 --connect-timeout 15 --max-time 90 -A "Mozilla/5.0" \
    "https://hallownest.net/wp-json/wp/v2/pages?slug=downloads&_fields=content" \
    -o /tmp/hallownest-downloads.json && return 0
  return 1
}

FULL_PAGE=""
if fetch_downloads_json; then
  FULL_PAGE="$(python3 - <<'PY'
import json,re,html
try:
    data=json.load(open('/tmp/hallownest-downloads.json',encoding='utf-8'))
    raw=''
    if isinstance(data,list) and data:
        raw=((data[0].get('content') or {}).get('rendered') or '')
    elif isinstance(data,dict):
        raw=((data.get('content') or {}).get('rendered') or '')
    s=html.unescape(raw)
except Exception:
    print(''); raise SystemExit
rows=re.findall(r'<tr\b.*?</tr>',s,re.I|re.S)
for row in rows:
    txt=re.sub(r'<[^>]+>',' ',row)
    if ('72,622' in txt and '48,128' in txt) or '835.61' in txt:
        for link in re.findall(r'href=["\']([^"\']+)["\']',row,re.I):
            if 'mediafire.com' in link.lower():
                print(link); raise SystemExit
print('')
PY
)"
fi

if [ -n "$FULL_PAGE" ]; then
  echo "Official 100% MediaFire page found."
  FULL_URL="$(resolve_mediafire "$FULL_PAGE")"
  if [ -n "$FULL_URL" ]; then
    echo "Downloading official 100% Hallownest map (~836 MB)..."
    curl -fLsS --retry 2 --connect-timeout 20 --max-time 1800 \
      -A "Mozilla/5.0" -e "$FULL_PAGE" "$FULL_URL" -o /tmp/hallownest-hd.png || true
  fi
else
  echo "WARNING: official 100% link could not be resolved from Hallownest.net."
fi

if [ -s /tmp/hallownest-hd.png ]; then
  FULL_DIMS="$(file /tmp/hallownest-hd.png | sed -nE 's/.* ([0-9]+) x ([0-9]+).*/\1 \2/p' | head -n1)"
  FULL_W="$(printf '%s' "$FULL_DIMS" | awk '{print $1}')"
  FULL_H="$(printf '%s' "$FULL_DIMS" | awk '{print $2}')"
  echo "Official candidate dimensions: ${FULL_W}x${FULL_H}"
  FULL_OK="$(awk -v w="$FULL_W" -v h="$FULL_H" 'BEGIN{r=(h>0?w/h:0);t=72622/48128;print (w>=70000&&h>=46000&&(r-t<0.01&&t-r<0.01))?1:0}')"
  if [ "$FULL_OK" != "1" ]; then
    echo "WARNING: official 100% candidate failed dimension validation."
    rm -f /tmp/hallownest-hd.png
  fi
fi

if [ ! -s /tmp/hallownest-hd.png ]; then
echo "Resolving ScriptersWar high-resolution map download..."
rm -rf /tmp/swscan
mkdir -p /tmp/swscan
rm -f /tmp/hallownest-hd.png

SW_PAGE="https://scripterswar.com/hollowknight/map?image=screenshot"
curl -fLsS --retry 3 --connect-timeout 15 --max-time 120 \
  -A "Mozilla/5.0" "$SW_PAGE" -o /tmp/swscan/page.html || true

# The download link is generated client-side on the current site, so inspect the JS bundles too.
if [ -s /tmp/swscan/page.html ]; then
  python3 - <<'PY' > /tmp/swscan/scripts.txt
import re,html
from urllib.parse import urljoin
base='https://scripterswar.com/hollowknight/map?image=screenshot'
s=html.unescape(open('/tmp/swscan/page.html',encoding='utf-8',errors='ignore').read())
seen=set()
for src in re.findall(r'<script\b[^>]*\bsrc=["\']([^"\']+)["\']',s,re.I):
    u=urljoin(base,src)
    if u not in seen:
        seen.add(u); print(u)
PY

  i=0
  while IFS= read -r js; do
    [ -n "$js" ] || continue
    i=$((i+1))
    [ "$i" -le 30 ] || break
    curl -LsS --retry 1 --connect-timeout 10 --max-time 60 \
      -A "Mozilla/5.0" -e "$SW_PAGE" "$js" -o "/tmp/swscan/js_$i.txt" || true
  done < /tmp/swscan/scripts.txt
fi

python3 - <<'PY' > /tmp/swscan/candidates.txt
import re,glob,html
from urllib.parse import urljoin
base='https://scripterswar.com/hollowknight/map?image=screenshot'
texts=[]
for f in ['/tmp/swscan/page.html']+glob.glob('/tmp/swscan/js_*.txt'):
    try:texts.append(open(f,encoding='utf-8',errors='ignore').read())
    except:pass
s=html.unescape('\n'.join(texts))
vals=[]
# Absolute URLs.
vals += re.findall(r'https?://[^\s"\'<>\\]+',s,re.I)
# Quoted relative asset/download paths.
vals += re.findall(r'["\']([^"\']+(?:\.png|\.webp|\.jpg|\.jpeg|mediafire\.com/[^"\']+))["\']',s,re.I)
seen=set()
for raw in vals:
    raw=raw.replace('\\/','/').replace('\\u0026','&').strip()
    u=urljoin(base,raw)
    low=u.lower()
    if not any(k in low for k in ('mediafire','b-cdn','bunny','hollow','map','.png','.webp','.jpg','.jpeg')):
        continue
    if u in seen: continue
    seen.add(u)
    print(u)
PY

echo "Scanning ScriptersWar asset candidates..."
rm -f /tmp/swscan/selected-url.txt /tmp/swscan/selected.png
COUNT=0

while IFS= read -r cand; do
  [ -n "$cand" ] || continue
  COUNT=$((COUNT+1))
  [ "$COUNT" -le 120 ] || break

  url="$cand"
  if printf '%s' "$url" | grep -qi 'mediafire.com'; then
    direct="$(resolve_mediafire "$url")"
    [ -n "$direct" ] || continue
    url="$direct"
  fi

  headers="$(curl -LsSI --retry 1 --connect-timeout 8 --max-time 25 \
    -A "Mozilla/5.0" -e "$SW_PAGE" "$url" 2>/dev/null || true)"
  ctype="$(printf '%s\n' "$headers" | tr -d '\r' | awk -F': ' 'tolower($1)=="content-type"{v=$2} END{print v}')"
  clen="$(printf '%s\n' "$headers" | tr -d '\r' | awk -F': ' 'tolower($1)=="content-length"{v=$2} END{print v}')"
  case "$clen" in ''|*[!0-9]*) clen=0;; esac

  [ "$clen" -ge 15000000 ] || continue
  if ! printf '%s' "$ctype" | grep -qi '^image/' && ! printf '%s' "$url" | grep -qiE '\.(png|webp|jpg|jpeg)([?&]|$)'; then
    continue
  fi

  echo "Checking large image candidate: $clen bytes"
  rm -f /tmp/swscan/probe.img
  curl -fLsS --retry 1 --connect-timeout 12 --max-time 300 \
    -A "Mozilla/5.0" -e "$SW_PAGE" "$url" -o /tmp/swscan/probe.img || true
  [ -s /tmp/swscan/probe.img ] || continue

  dims="$(file /tmp/swscan/probe.img | sed -nE 's/.* ([0-9]+) x ([0-9]+).*/\1 \2/p' | head -n1)"
  [ -n "$dims" ] || continue
  w="$(printf '%s' "$dims" | awk '{print $1}')"
  h="$(printf '%s' "$dims" | awk '{print $2}')"
  echo "Candidate dimensions: ${w}x${h}"

  good="$(awk -v w="$w" -v h="$h" 'BEGIN{
    r=w/h; target=72622/48128;
    exact=( (w>=18000 && w<=18350 && h>=11900 && h<=12150) ||
            (w>=36000 && w<=36650 && h>=23900 && h<=24200) ||
            (w>=72000 && w<=73250 && h>=47900 && h<=48400) );
    close=(w>=17000 && (r-target<0.015 && target-r<0.015));
    print (exact || close) ? 1 : 0;
  }')"

  if [ "$good" = "1" ]; then
    mv /tmp/swscan/probe.img /tmp/swscan/selected.png
    printf '%s' "$url" > /tmp/swscan/selected-url.txt
    echo "Compatible Hallownest world map found."
    break
  fi
done < /tmp/swscan/candidates.txt

if [ -s /tmp/swscan/selected.png ]; then
  mv /tmp/swscan/selected.png /tmp/hallownest-hd.png
fi
fi

# Validate that the downloaded HD candidate is actually an image.
if [ -s /tmp/hallownest-hd.png ]; then
  if ! file /tmp/hallownest-hd.png | grep -qiE 'PNG|image'; then
    echo "WARNING: ScriptersWar HD link did not return an image."
    rm -f /tmp/hallownest-hd.png
  fi
fi

if [ -s /tmp/hallownest-hd.png ]; then
  echo "High-resolution screenshot downloaded: $(du -h /tmp/hallownest-hd.png | cut -f1)"
else
  echo "WARNING: high-resolution source could not be downloaded; building tiles from 12.5% fallback."
  cp maps/hallownest-screenshot.png /tmp/hallownest-hd.png
fi

echo "Installing image tiler..."
rm -rf /tmp/hksharp
if ! npm install --prefix /tmp/hksharp --no-save --silent sharp@0.34.1; then
  echo "ERROR: Sharp install failed"
  exit 1
fi

echo "Creating lightweight full-map preview..."
NODE_PATH=/tmp/hksharp/node_modules node - <<'NODE'
const sharp=require('sharp');
sharp('maps/hallownest-screenshot.png',{limitInputPixels:false})
  .resize({width:2600,withoutEnlargement:true})
  .webp({quality:86,effort:3})
  .toFile('maps/hallownest-screenshot-preview.webp')
  .catch(e=>{console.error(e);process.exit(1)});
NODE

echo "Creating progressive screenshot tile pyramid..."
rm -rf maps/screenshot-hd_files maps/screenshot-hd.dzi
if NODE_PATH=/tmp/hksharp/node_modules node tile-screenshot.js \
    /tmp/hallownest-hd.png maps/screenshot-hd maps/map-quality.js; then
  echo "Progressive pyramid ready: $(find maps/screenshot-hd_files -type f 2>/dev/null | wc -l) tiles"
else
  echo "ERROR: screenshot tile pyramid generation failed"
  exit 1
fi

rm -f /tmp/hallownest-hd.png /tmp/sw-map.html
rm -rf /tmp/hksharp
echo "Map build completed."
