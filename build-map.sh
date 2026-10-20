#!/usr/bin/env bash
set -euo pipefail

mkdir -p maps

echo "Downloading Sketch map..."
curl -fLsS --retry 3 --connect-timeout 15 --max-time 120   -A "Mozilla/5.0"   "https://hollowknight.wiki/wiki/Special:Redirect/file/Clean_map_updated.png"   -o maps/hallownest-sketch.png

echo "Sketch: $(du -h maps/hallownest-sketch.png | cut -f1)"

echo "Downloading Screenshot map page..."
MF_PAGE="https://www.mediafire.com/file/jmwvqizn8ldfp0f/Combined%252B12.5%2525.png/file"
HTML="$(curl -fLsS --retry 3 --connect-timeout 15 --max-time 60 -A 'Mozilla/5.0' "$MF_PAGE")"

DOWNLOAD_URL="$(printf '%s' "$HTML" | grep -oE 'https://download[^"]+Combined[^"]+\.png' | head -n1 | sed 's/&amp;/\&/g' || true)"

if [ -z "$DOWNLOAD_URL" ]; then
  DOWNLOAD_URL="$(printf '%s' "$HTML" | grep -oE 'https://[^"]+mediafire[^"]+\.png[^"]*' | head -n1 | sed 's/&amp;/\&/g' || true)"
fi

if [ -z "$DOWNLOAD_URL" ]; then
  echo "ERROR: unable to resolve Hallownest screenshot download URL"
  exit 1
fi

echo "Downloading Screenshot map..."
curl -fLsS --retry 3 --connect-timeout 15 --max-time 300   -A "Mozilla/5.0" -e "$MF_PAGE"   "$DOWNLOAD_URL" -o maps/hallownest-screenshot.png

echo "Screenshot: $(du -h maps/hallownest-screenshot.png | cut -f1)"

python3 - <<'PY'
from PIL import Image
for f in ["maps/hallownest-sketch.png","maps/hallownest-screenshot.png"]:
    im=Image.open(f)
    print(f, im.size, im.format)
PY

echo "Both map bases ready."
