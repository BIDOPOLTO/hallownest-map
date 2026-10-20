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

echo "Resolving ScriptersWar high-resolution map download..."
rm -f /tmp/sw-map.html /tmp/hallownest-hd.png
curl -fLsS --retry 3 --connect-timeout 15 --max-time 120 \
  -A "Mozilla/5.0" \
  "https://scripterswar.com/hollowknight/map?image=screenshot" \
  -o /tmp/sw-map.html || true

HD_LINK=""
if [ -s /tmp/sw-map.html ]; then
  HD_LINK="$(perl -0777 -ne 'if (/<a\b[^>]*href=["'"'"']([^"'"'"']+)["'"'"'][^>]*>.*?Download\s+map\s+image\s*\(85\s*MB\).*?<\/a>/is){print $1}' /tmp/sw-map.html 2>/dev/null || true)"
fi

if [ -n "$HD_LINK" ]; then
  case "$HD_LINK" in
    http://*|https://*) ;;
    /*) HD_LINK="https://scripterswar.com$HD_LINK" ;;
    *) HD_LINK="https://scripterswar.com/hollowknight/$HD_LINK" ;;
  esac
  echo "High-resolution download link found."

  if printf '%s' "$HD_LINK" | grep -qi 'mediafire.com'; then
    HD_DIRECT="$(resolve_mediafire "$HD_LINK")"
    if [ -n "$HD_DIRECT" ]; then
      curl -fLsS --retry 2 --connect-timeout 15 --max-time 600 \
        -A "Mozilla/5.0" -e "$HD_LINK" "$HD_DIRECT" \
        -o /tmp/hallownest-hd.png || true
    fi
  else
    curl -fLsS --retry 2 --connect-timeout 15 --max-time 600 \
      -A "Mozilla/5.0" -e "https://scripterswar.com/hollowknight/map?image=screenshot" \
      "$HD_LINK" -o /tmp/hallownest-hd.png || true
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
