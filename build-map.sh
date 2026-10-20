#!/usr/bin/env bash
set -u
mkdir -p maps

echo "Downloading Sketch map from GitHub mirror..."
curl -fLsS --retry 3 --connect-timeout 15 --max-time 120 \
  -A "Mozilla/5.0" \
  "https://raw.githubusercontent.com/sadabx/hallownest-tracker/main/public/assets/maps/hallownest-clean.webp" \
  -o maps/hallownest-sketch.webp

if [ ! -s maps/hallownest-sketch.webp ]; then
  echo "ERROR: Sketch map download failed"
  exit 1
fi
echo "Sketch downloaded: $(du -h maps/hallownest-sketch.webp | cut -f1)"

resolve_mediafire () {
  page="$1"
  html="$(curl -LsS --retry 2 --connect-timeout 15 --max-time 90 -A 'Mozilla/5.0' "$page" || true)"
  printf '%s' "$html" | grep -oE 'https://download[^"]+\.png[^"]*' | head -n1 | sed 's/&amp;/\&/g'
}

echo "Downloading 12.5% Screenshot fallback..."
rm -f maps/hallownest-screenshot.png
LOW_PAGE="https://www.mediafire.com/file/jmwvqizn8ldfp0f/Combined%252B12.5%2525.png/file"
LOW_URL="$(resolve_mediafire "$LOW_PAGE")"
if [ -n "$LOW_URL" ]; then
  curl -fLsS --retry 2 --connect-timeout 15 --max-time 300 \
    -A "Mozilla/5.0" -e "$LOW_PAGE" "$LOW_URL" \
    -o maps/hallownest-screenshot.png || true
fi
if [ -s maps/hallownest-screenshot.png ]; then
  echo "Screenshot fallback downloaded: $(du -h maps/hallownest-screenshot.png | cut -f1)"
else
  rm -f maps/hallownest-screenshot.png
  echo "WARNING: Screenshot fallback unavailable; Sketch will still work."
fi

echo "Looking for the 25% HD Screenshot source..."
rm -rf maps/screenshot-hd_files maps/screenshot-hd.dzi
rm -f /tmp/hallownest-downloads.html /tmp/hallownest-hd.png
curl -fLsS --retry 3 --connect-timeout 15 --max-time 120 \
  -A "Mozilla/5.0" "https://www.hallownest.net/downloads/" \
  -o /tmp/hallownest-downloads.html || true

HD_PAGE="$(python3 - <<'PY'
import re, html as h
try:
    s=h.unescape(open('/tmp/hallownest-downloads.html',encoding='utf-8',errors='ignore').read())
except Exception:
    print('')
    raise SystemExit
rows=re.findall(r'<tr\b.*?</tr>',s,re.I|re.S)
for row in rows:
    text=re.sub(r'<[^>]+>',' ',row)
    if '18,156' in text or re.search(r'25\s*%\s*size',text,re.I):
        links=re.findall(r'href=["\']([^"\']+)["\']',row,re.I)
        for link in links:
            if 'mediafire.com' in link.lower():
                print(link); raise SystemExit
links=re.findall(r'href=["\']([^"\']*mediafire\.com[^"\']*)["\']',s,re.I)
# Combined map links are the first entries on the page: 12.5%, 25%, 50%, 100%.
print(links[1] if len(links)>1 else '')
PY
)"

if [ -n "$HD_PAGE" ]; then
  echo "25% source page resolved."
  HD_HTML="$(curl -LsS --retry 2 --connect-timeout 15 --max-time 90 -A 'Mozilla/5.0' "$HD_PAGE" || true)"
  HD_URL="$(printf '%s' "$HD_HTML" | grep -oE 'https://download[^"]+\.png[^"]*' | head -n1 | sed 's/&amp;/\&/g' || true)"
  if [ -n "$HD_URL" ]; then
    echo "Downloading 25% Screenshot HD (~89 MB)..."
    curl -fLsS --retry 2 --connect-timeout 15 --max-time 600 \
      -A "Mozilla/5.0" -e "$HD_PAGE" "$HD_URL" \
      -o /tmp/hallownest-hd.png || true
  fi
fi

if [ -s /tmp/hallownest-hd.png ]; then
  echo "HD source downloaded: $(du -h /tmp/hallownest-hd.png | cut -f1)"
  echo "Preparing HD tile pyramid..."
  rm -rf /tmp/hksharp
  if npm install --prefix /tmp/hksharp --no-save --silent sharp@0.33.5; then
    if NODE_PATH=/tmp/hksharp/node_modules node tile-screenshot.js /tmp/hallownest-hd.png maps/screenshot-hd.dzi; then
      echo "HD tiles ready: $(find maps/screenshot-hd_files -type f 2>/dev/null | wc -l) files"
    else
      echo "WARNING: HD tiling failed; 12.5% Screenshot fallback remains available."
      rm -rf maps/screenshot-hd_files maps/screenshot-hd.dzi
    fi
  else
    echo "WARNING: Sharp install failed; 12.5% Screenshot fallback remains available."
  fi
else
  echo "WARNING: 25% HD source unavailable; 12.5% Screenshot fallback remains available."
fi

rm -f /tmp/hallownest-hd.png /tmp/hallownest-downloads.html
rm -rf /tmp/hksharp

echo "Map build completed."
