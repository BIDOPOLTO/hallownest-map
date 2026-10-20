#!/usr/bin/env bash
set -u
mkdir -p maps
printf 'window.HK_HD_MAP={"available":false};\n' > maps/map-quality.js
UA="Mozilla/5.0"

resolve_mediafire () {
  page="$1"
  html="$(curl -LsS --retry 2 --connect-timeout 15 --max-time 120 -A "$UA" "$page" || true)"
  printf '%s' "$html" \
    | grep -oE 'https://download[^"]+\.(png|jpg|jpeg|webp)[^"]*' \
    | head -n1 \
    | sed 's/&amp;/\&/g'
}

echo "Downloading Sketch map..."
curl -fLsS --retry 3 --connect-timeout 15 --max-time 120 \
  -A "$UA" \
  "https://raw.githubusercontent.com/sadabx/hallownest-tracker/main/public/assets/maps/hallownest-clean.webp" \
  -o maps/hallownest-sketch.webp
[ -s maps/hallownest-sketch.webp ] || { echo "ERROR: Sketch download failed"; exit 1; }

echo "Downloading 12.5% screenshot fallback..."
LOW_PAGE="https://www.mediafire.com/file/jmwvqizn8ldfp0f/Combined%252B12.5%2525.png/file"
LOW_URL="$(resolve_mediafire "$LOW_PAGE")"
rm -f maps/hallownest-screenshot.png
if [ -n "$LOW_URL" ]; then
  curl -fLsS --retry 2 --connect-timeout 15 --max-time 300 \
    -A "$UA" -e "$LOW_PAGE" "$LOW_URL" \
    -o maps/hallownest-screenshot.png || true
fi
[ -s maps/hallownest-screenshot.png ] || { echo "ERROR: 12.5% screenshot fallback unavailable"; exit 1; }
echo "Fallback screenshot downloaded: $(du -h maps/hallownest-screenshot.png | cut -f1)"

echo "Resolving official 100% Hallownest world map..."
rm -f /tmp/hallownest-reader.txt /tmp/hallownest-full.png

for READER_URL in \
  "https://r.jina.ai/http://www.hallownest.net/downloads/" \
  "https://r.jina.ai/https://www.hallownest.net/downloads/"
do
  curl -fLsS --retry 2 --connect-timeout 15 --max-time 180 \
    -A "$UA" "$READER_URL" -o /tmp/hallownest-reader.txt || true
  [ -s /tmp/hallownest-reader.txt ] && break
done

FULL_PAGE=""
if [ -s /tmp/hallownest-reader.txt ]; then
  FULL_PAGE="$(python3 - <<'PY'
import re, html
try:
    s = html.unescape(open('/tmp/hallownest-reader.txt', encoding='utf-8', errors='ignore').read())
except Exception:
    print('')
    raise SystemExit

targets = []
for m in re.finditer(r'72,622|835\.61\s*MB', s, re.I):
    targets.append(m.start())

for pos in targets:
    chunk = s[max(0, pos-1200):pos+3000]
    links = re.findall(r'https?://[^\s\)\]>"\']+', chunk, re.I)
    for link in links:
        if 'mediafire.com' in link.lower():
            print(link)
            raise SystemExit

print('')
PY
)"
fi

if [ -n "$FULL_PAGE" ]; then
  echo "Official 100% MediaFire page found."
  FULL_URL="$(resolve_mediafire "$FULL_PAGE")"
  if [ -n "$FULL_URL" ]; then
    echo "Downloading official 100% map (~836 MB)..."
    curl -fLsS --retry 2 --connect-timeout 20 --max-time 2400 \
      -A "$UA" -e "$FULL_PAGE" "$FULL_URL" \
      -o /tmp/hallownest-full.png || true
  fi
else
  echo "WARNING: official 100% download link was not resolved."
fi

if [ -s /tmp/hallownest-full.png ]; then
  DIMS="$(file /tmp/hallownest-full.png | sed -nE 's/.* ([0-9]+) x ([0-9]+).*/\1 \2/p' | head -n1)"
  FULL_W="$(printf '%s' "$DIMS" | awk '{print $1}')"
  FULL_H="$(printf '%s' "$DIMS" | awk '{print $2}')"
  echo "100% candidate dimensions: $FULL_W x $FULL_H"
  FULL_OK="$(awk -v w="$FULL_W" -v h="$FULL_H" 'BEGIN {
    if (h <= 0) { print 0; exit }
    r=w/h; t=72622/48128;
    print (w>=70000 && h>=46000 && r>t-0.01 && r<t+0.01) ? 1 : 0
  }')"
  if [ "$FULL_OK" != "1" ]; then
    echo "WARNING: 100% candidate failed dimension validation."
    rm -f /tmp/hallownest-full.png
  fi
fi

if [ -s /tmp/hallownest-full.png ]; then
  TILE_SOURCE="/tmp/hallownest-full.png"
  echo "Using full-resolution source."
else
  TILE_SOURCE="maps/hallownest-screenshot.png"
  echo "Using 12.5% fallback for tiles."
fi

echo "Installing image tiler..."
rm -rf /tmp/hksharp
npm install --prefix /tmp/hksharp --no-save --silent sharp@0.34.1 \
  || { echo "ERROR: Sharp install failed"; exit 1; }

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
NODE_PATH=/tmp/hksharp/node_modules node tile-screenshot.js \
  "$TILE_SOURCE" maps/screenshot-hd maps/map-quality.js \
  || { echo "ERROR: screenshot tile pyramid generation failed"; exit 1; }

echo "Progressive pyramid ready: $(find maps/screenshot-hd_files -type f 2>/dev/null | wc -l) tiles"
rm -f /tmp/hallownest-reader.txt /tmp/hallownest-full.png
rm -rf /tmp/hksharp
echo "Map build completed."
