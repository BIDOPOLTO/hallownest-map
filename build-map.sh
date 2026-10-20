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
  curl -fLsS --retry 2 --connect-timeout 15 --max-time 300 -A "Mozilla/5.0" -e "$LOW_PAGE" "$LOW_URL" -o maps/hallownest-screenshot.png || true
fi
[ -s maps/hallownest-screenshot.png ] || echo "WARNING: fallback screenshot unavailable."

echo "Resolving high-resolution screenshot source..."
curl -fLsS --retry 3 --connect-timeout 15 --max-time 120 -A "Mozilla/5.0" \
  "https://www.hallownest.net/downloads/" -o /tmp/hk-downloads.html || true

extract_row_link () {
  dims="$1"
  python3 - "$dims" <<'PY'
import sys,re,html
needle=sys.argv[1]
try:s=html.unescape(open('/tmp/hk-downloads.html',encoding='utf-8',errors='ignore').read())
except:print('');raise SystemExit
for row in re.findall(r'<tr\b.*?</tr>',s,re.I|re.S):
    text=re.sub(r'<[^>]+>',' ',row)
    if needle in text:
        links=re.findall(r'href=["\']([^"\']+)["\']',row,re.I)
        for link in links:
            if 'mediafire.com' in link.lower():
                print(link);raise SystemExit
print('')
PY
}

HD_PAGE="$(extract_row_link '36,311')"
HD_KIND="50%"
if [ -z "$HD_PAGE" ]; then
  HD_PAGE="$(extract_row_link '18,156')"
  HD_KIND="25%"
fi

rm -f /tmp/hallownest-hd.png
if [ -n "$HD_PAGE" ]; then
  HD_URL="$(resolve_mediafire "$HD_PAGE")"
  if [ -n "$HD_URL" ]; then
    echo "Downloading $HD_KIND HD screenshot source..."
    curl -fLsS --retry 2 --connect-timeout 15 --max-time 900 -A "Mozilla/5.0" -e "$HD_PAGE" "$HD_URL" -o /tmp/hallownest-hd.png || true
  fi
fi

if [ ! -s /tmp/hallownest-hd.png ] && [ "$HD_KIND" = "50%" ]; then
  echo "50% source unavailable; falling back to 25%..."
  HD_PAGE="$(extract_row_link '18,156')"
  HD_KIND="25%"
  if [ -n "$HD_PAGE" ]; then
    HD_URL="$(resolve_mediafire "$HD_PAGE")"
    if [ -n "$HD_URL" ]; then
      curl -fLsS --retry 2 --connect-timeout 15 --max-time 600 -A "Mozilla/5.0" -e "$HD_PAGE" "$HD_URL" -o /tmp/hallownest-hd.png || true
    fi
  fi
fi

echo "Installing image tiler..."
rm -rf /tmp/hksharp
if npm install --prefix /tmp/hksharp --no-save --silent sharp@0.34.1; then
  if [ -s maps/hallownest-screenshot.png ]; then
    echo "Creating lightweight full-map preview..."
    NODE_PATH=/tmp/hksharp/node_modules node - <<'NODE'
const sharp=require('sharp');
sharp('maps/hallownest-screenshot.png',{limitInputPixels:false})
  .resize({width:2600,withoutEnlargement:true})
  .webp({quality:86,effort:3})
  .toFile('maps/hallownest-screenshot-preview.webp')
  .catch(e=>{console.error(e);process.exit(1)});
NODE
  fi

  if [ -s /tmp/hallownest-hd.png ]; then
    echo "Creating progressive HD pyramid from $HD_KIND source..."
    rm -rf maps/screenshot-hd_files maps/screenshot-hd.dzi
    if NODE_PATH=/tmp/hksharp/node_modules node tile-screenshot.js \
      /tmp/hallownest-hd.png maps/screenshot-hd maps/map-quality.js; then
      echo "HD pyramid ready: $(find maps/screenshot-hd_files -type f 2>/dev/null | wc -l) tiles"
    else
      echo "WARNING: HD pyramid generation failed for $HD_KIND source."
      rm -rf maps/screenshot-hd_files maps/screenshot-hd.dzi
      printf 'window.HK_HD_MAP={"available":false};\n' > maps/map-quality.js

      if [ "$HD_KIND" = "50%" ]; then
        echo "Retrying pyramid with 25% source..."
        HD_PAGE="$(extract_row_link '18,156')"
        HD_URL="$(resolve_mediafire "$HD_PAGE")"
        rm -f /tmp/hallownest-hd.png
        if [ -n "$HD_URL" ]; then
          curl -fLsS --retry 2 --connect-timeout 15 --max-time 600 -A "Mozilla/5.0" -e "$HD_PAGE" "$HD_URL" -o /tmp/hallownest-hd.png || true
        fi
        if [ -s /tmp/hallownest-hd.png ]; then
          if NODE_PATH=/tmp/hksharp/node_modules node tile-screenshot.js \
            /tmp/hallownest-hd.png maps/screenshot-hd maps/map-quality.js; then
            echo "25% HD pyramid ready: $(find maps/screenshot-hd_files -type f 2>/dev/null | wc -l) tiles"
          else
            rm -rf maps/screenshot-hd_files maps/screenshot-hd.dzi
            printf 'window.HK_HD_MAP={"available":false};\n' > maps/map-quality.js
          fi
        fi
      fi
    fi
  else
    echo "WARNING: HD source unavailable; using screenshot preview only."
  fi
else
  echo "WARNING: Sharp install failed; using screenshot preview/full fallback only."
fi

if [ ! -s maps/hallownest-screenshot-preview.webp ] && [ -s maps/hallownest-screenshot.png ]; then
  cp maps/hallownest-screenshot.png maps/hallownest-screenshot-preview.webp
fi

rm -f /tmp/hallownest-hd.png /tmp/hk-downloads.html
rm -rf /tmp/hksharp
echo "Map build completed."
