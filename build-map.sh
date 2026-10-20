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

echo "Trying Screenshot map..."
rm -f maps/hallownest-screenshot.png
MF_PAGE="https://www.mediafire.com/file/jmwvqizn8ldfp0f/Combined%252B12.5%2525.png/file"
HTML="$(curl -LsS --retry 2 --connect-timeout 15 --max-time 60 -A 'Mozilla/5.0' "$MF_PAGE" || true)"
DOWNLOAD_URL="$(printf '%s' "$HTML" | grep -oE 'https://download[^"]+Combined[^"]+\.png[^"]*' | head -n1 | sed 's/&amp;/\&/g' || true)"

if [ -n "$DOWNLOAD_URL" ]; then
  if curl -fLsS --retry 2 --connect-timeout 15 --max-time 300 \
      -A "Mozilla/5.0" -e "$MF_PAGE" "$DOWNLOAD_URL" \
      -o maps/hallownest-screenshot.png; then
    echo "Screenshot downloaded: $(du -h maps/hallownest-screenshot.png | cut -f1)"
  else
    rm -f maps/hallownest-screenshot.png
    echo "WARNING: Screenshot map unavailable; site will use Sketch only for now."
  fi
else
  echo "WARNING: Screenshot download URL not resolved; site will use Sketch only for now."
fi

echo "Map build completed."
