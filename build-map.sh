#!/usr/bin/env bash
set -uo pipefail
mkdir -p maps
UA="Mozilla/5.0"

resolve_mediafire () {
  page="$1"
  html="$(curl -LsS --retry 2 --connect-timeout 15 --max-time 120 -A "$UA" "$page" || true)"
  printf '%s' "$html" | grep -oE 'https://download[^"]+\.(png|jpg|jpeg|webp)[^"]*' | head -n1 | sed 's/&amp;/\&/g'
}

discover_sw_asset () {
  mode="$1"
  out="$2"
  work="/tmp/sw-$mode"
  rm -rf "$work"
  mkdir -p "$work"
  page="https://scripterswar.com/hollowknight/map?image=$mode"

  echo "Scanning ScriptersWar $mode assets..."
  curl -fLsS --retry 3 --connect-timeout 15 --max-time 120 -A "$UA" "$page" -o "$work/page.html" || true
  [ -s "$work/page.html" ] || return 1

  python3 - "$work/page.html" "$page" <<'PY' > "$work/scripts.txt"
import sys,re,html
from urllib.parse import urljoin,urlsplit
fn,base=sys.argv[1],sys.argv[2]
s=html.unescape(open(fn,encoding='utf-8',errors='ignore').read())
seen=set()
for src in re.findall(r'<script\b[^>]*\bsrc=["\']([^"\']+)["\']',s,re.I):
    u=urljoin(base,src.replace('\\/','/'))
    p=urlsplit(u)
    if p.scheme in ('http','https') and u not in seen:
        seen.add(u); print(u)
PY

  i=0
  while IFS= read -r js; do
    [ -n "$js" ] || continue
    i=$((i+1))
    [ "$i" -le 40 ] || break
    curl -LsS --retry 1 --connect-timeout 10 --max-time 60 -A "$UA" -e "$page" "$js" -o "$work/js_$i.txt" || true
  done < "$work/scripts.txt"

  python3 - "$work" "$page" "$mode" <<'PY' > "$work/candidates.txt"
import sys,re,glob,html
from urllib.parse import urljoin,urlsplit
work,base,mode=sys.argv[1:4]
texts=[]
for f in [work+'/page.html']+glob.glob(work+'/js_*.txt'):
    try:texts.append(open(f,encoding='utf-8',errors='ignore').read())
    except:pass
s=html.unescape('\n'.join(texts)).replace('\\/','/').replace('\\u0026','&')
vals=re.findall(r'https?://[^\s"\'<>\\]+',s,re.I)
vals+=re.findall(r'["\']([^"\']+(?:\.png|\.webp|\.jpg|\.jpeg|mediafire\.com/[^"\']+))["\']',s,re.I)
seen=set()
for raw in vals:
    raw=raw.strip().rstrip(';,')
    u=urljoin(base,raw)
    p=urlsplit(u)
    if p.scheme not in ('http','https') or not p.netloc: continue
    if any(c in u for c in ('"',"'","\\","<",">","\n","\r","\t")): continue
    low=u.lower()
    if not any(k in low for k in ('mediafire','.png','.webp','.jpg','.jpeg','b-cdn','bunny')): continue
    if u in seen: continue
    seen.add(u)
    print(u)
PY

  best=""
  bestScore=0
  bestSize=0
  count=0
  while IFS= read -r cand; do
    [ -n "$cand" ] || continue
    count=$((count+1))
    [ "$count" -le 160 ] || break
    case "$cand" in http://*|https://*) ;; *) continue ;; esac

    url="$cand"
    if printf '%s' "$url" | grep -qi 'mediafire.com'; then
      direct="$(resolve_mediafire "$url")"
      [ -n "$direct" ] || continue
      url="$direct"
    fi

    headers="$(curl -LsSI --retry 1 --connect-timeout 8 --max-time 20 -A "$UA" -e "$page" "$url" 2>/dev/null || true)"
    ctype="$(printf '%s\n' "$headers" | tr -d '\r' | awk -F': ' 'tolower($1)=="content-type"{v=$2} END{print v}')"
    clen="$(printf '%s\n' "$headers" | tr -d '\r' | awk -F': ' 'tolower($1)=="content-length"{v=$2} END{print v}')"
    case "$clen" in ''|*[!0-9]*) clen=0;; esac
    if ! printf '%s' "$ctype" | grep -qi '^image/' && ! printf '%s' "$url" | grep -qiE '\.(png|webp|jpg|jpeg)([?&]|$)'; then
      continue
    fi
    [ "$clen" -ge 100000 ] || continue

    bonus=0
    lower="$(printf '%s' "$url" | tr '[:upper:]' '[:lower:]')"
    if printf '%s' "$lower" | grep -q "$mode"; then bonus=1000000000; fi
    score=$((clen+bonus))
    if [ "$score" -gt "$bestScore" ]; then
      bestScore="$score"; bestSize="$clen"; best="$url"
    fi
  done < "$work/candidates.txt"

  [ -n "$best" ] || return 1
  echo "Selected $mode candidate: $bestSize bytes"
  curl -fLsS --retry 2 --connect-timeout 15 --max-time 900 -A "$UA" -e "$page" "$best" -o "$out" || return 1
  [ -s "$out" ] || return 1
  dims="$(file "$out" | sed -nE 's/.* ([0-9]+) x ([0-9]+).*/\1 \2/p' | head -n1)"
  echo "$mode candidate dimensions: $dims"
  return 0
}

echo "Downloading Hallownest 12.5% emergency fallback..."
LOW_PAGE="https://www.mediafire.com/file/jmwvqizn8ldfp0f/Combined%252B12.5%2525.png/file"
LOW_URL="$(resolve_mediafire "$LOW_PAGE")"
rm -f maps/hallownest-screenshot-fallback.png
if [ -n "$LOW_URL" ]; then
  curl -fLsS --retry 2 --connect-timeout 15 --max-time 300 -A "$UA" -e "$LOW_PAGE" "$LOW_URL" -o maps/hallownest-screenshot-fallback.png || true
fi

rm -f /tmp/screenshot-ref.img /tmp/sketch-ref.img
discover_sw_asset screenshot /tmp/screenshot-ref.img || true
discover_sw_asset sketch /tmp/sketch-ref.img || true

echo "Sketch JS clues:"
python3 - <<'PY' || true
import glob,re
txt='\n'.join(open(f,encoding='utf-8',errors='ignore').read() for f in glob.glob('/tmp/sw-sketch/js_*.txt'))
seen=0
for pat in (r'.{0,180}sketch.{0,260}', r'.{0,180}4498.{0,260}', r'.{0,180}2901.{0,260}', r'.{0,180}(?:tile|bounds).{0,260}'):
    for m in re.finditer(pat,txt,re.I|re.S):
        z=re.sub(r'\s+',' ',m.group(0))
        print(z[:520])
        seen+=1
        if seen>=16: raise SystemExit
PY

if [ ! -s /tmp/screenshot-ref.img ]; then
  echo "WARNING: ScriptersWar screenshot source unavailable; using Hallownest fallback."
  cp maps/hallownest-screenshot-fallback.png /tmp/screenshot-ref.img
fi

echo "Installing image tools..."
rm -rf /tmp/hksharp
npm install --prefix /tmp/hksharp --no-save --silent sharp@0.34.1 || { echo "ERROR: Sharp install failed"; exit 1; }

echo "Preparing aligned screenshot preview..."
NODE_PATH=/tmp/hksharp/node_modules node - <<'NODE'
const sharp=require('sharp');
sharp('/tmp/screenshot-ref.img',{limitInputPixels:false})
  .resize({width:3000,withoutEnlargement:true})
  .webp({quality:88,effort:3})
  .toFile('maps/hallownest-screenshot-preview.webp')
  .catch(e=>{console.error(e);process.exit(1)});
NODE

USE_SKETCH_REF=0
if [ -s /tmp/sketch-ref.img ] && [ -s /tmp/screenshot-ref.img ]; then
  SKETCH_HASH="$(sha256sum /tmp/sketch-ref.img | awk '{print $1}')"
  SHOT_HASH="$(sha256sum /tmp/screenshot-ref.img | awk '{print $1}')"
  if [ "$SKETCH_HASH" != "$SHOT_HASH" ]; then USE_SKETCH_REF=1; fi
fi

if [ "$USE_SKETCH_REF" = "1" ]; then
  echo "Preparing distinct ScriptersWar sketch base..."
  NODE_PATH=/tmp/hksharp/node_modules node - <<'NODE'
const sharp=require('sharp');
sharp('/tmp/sketch-ref.img',{limitInputPixels:false})
  .resize({width:12000,withoutEnlargement:true})
  .webp({quality:95,effort:3})
  .toFile('maps/hallownest-sketch.webp')
  .catch(e=>{console.error(e);process.exit(1)});
NODE
else
  echo "ScriptersWar scan returned the Screenshot asset for Sketch; using clean-map fallback."
  curl -fLsS --retry 3 --connect-timeout 15 --max-time 120 -A "$UA" \
    "https://raw.githubusercontent.com/sadabx/hallownest-tracker/main/public/assets/maps/hallownest-clean.webp" \
    -o maps/hallownest-sketch.webp
fi

echo "Creating aligned progressive Screenshot pyramid..."
rm -rf maps/screenshot-hd_files maps/screenshot-hd.dzi
NODE_PATH=/tmp/hksharp/node_modules node tile-screenshot.js \
  /tmp/screenshot-ref.img maps/screenshot-hd maps/map-quality.js 16 \
  || { echo "ERROR: screenshot pyramid failed"; exit 1; }

echo "Pyramid ready: $(find maps/screenshot-hd_files -type f 2>/dev/null | wc -l) tiles"

# Try to resolve the official 100% Hallownest source for a later ultra-detail layer.
printf 'window.HK_ULTRA_MAP={"available":false};\n' > maps/ultra-quality.js
echo "Resolving official 100% Hallownest source..."
rm -f /tmp/hallownest-reader.txt /tmp/hallownest-full.png
for reader in \
  "https://r.jina.ai/http://www.hallownest.net/downloads/" \
  "https://r.jina.ai/https://www.hallownest.net/downloads/"
do
  curl -fLsS --retry 2 --connect-timeout 15 --max-time 180 -A "$UA" "$reader" -o /tmp/hallownest-reader.txt || true
  [ -s /tmp/hallownest-reader.txt ] && break
done

FULL_PAGE=""
if [ -s /tmp/hallownest-reader.txt ]; then
  FULL_PAGE="$(python3 - <<'PY'
import re,html
s=html.unescape(open('/tmp/hallownest-reader.txt',encoding='utf-8',errors='ignore').read())
# Restrict parsing to the Combined World Map table/section.
a=s.lower().find('combined world map')
b=s.lower().find("king's pass",a+1)
section=s[a:(b if b>a else a+12000)] if a>=0 else s[:12000]
for line in section.splitlines():
    if ('72,622' in line and '48,128' in line) or ('100%' in line and '835.61' in line):
        links=re.findall(r'https?://[^\s\)\]>"\']+',line,re.I)
        for u in links:
            if 'mediafire.com' in u.lower():
                print(u); raise SystemExit
# Markdown table may wrap links onto the following line: inspect a small block around exact dimensions.
m=re.search(r'72,622\s*x\s*48,128|835\.61\s*MB',section,re.I)
if m:
    chunk=section[max(0,m.start()-250):m.start()+700]
    links=re.findall(r'https?://[^\s\)\]>"\']+',chunk,re.I)
    for u in links:
        if 'mediafire.com' in u.lower():
            print(u); raise SystemExit
print('')
PY
)"
fi

if [ -n "$FULL_PAGE" ]; then
  FULL_URL="$(resolve_mediafire "$FULL_PAGE")"
  if [ -n "$FULL_URL" ]; then
    echo "Downloading 100% map (~836 MB)..."
    curl -fLsS --retry 2 --connect-timeout 20 --max-time 2400 -A "$UA" -e "$FULL_PAGE" "$FULL_URL" -o /tmp/hallownest-full.png || true
  fi
fi

if [ -s /tmp/hallownest-full.png ]; then
  dims="$(file /tmp/hallownest-full.png | sed -nE 's/.* ([0-9]+) x ([0-9]+).*/\1 \2/p' | head -n1)"
  echo "100% candidate dimensions: $dims"
else
  echo "100% source not resolved in this build."
fi

rm -f /tmp/screenshot-ref.img /tmp/sketch-ref.img /tmp/hallownest-reader.txt /tmp/hallownest-full.png
rm -rf /tmp/hksharp
echo "Map build completed."
