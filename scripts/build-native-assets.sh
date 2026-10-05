#!/usr/bin/env bash
# Regenerate the NATIVE shell's launcher icons and splash screens from the app's
# own art. Run from the repo root, after `npx cap add android`.
#
# WHY THIS EXISTS RATHER THAN `@capacitor/assets`: that tool needs `sharp`,
# whose native build fails on this box's Node 26 (`node-gyp`/`make`), and the
# repo already rasterises its art with `rsvg-convert` (`scripts/build-icons.sh`).
# Adding a native dependency to change some PNGs is the wrong trade.
#
# WHAT IT REPLACES: `npx cap add android` writes CAPACITOR'S OWN logo into every
# mipmap and splash — so the shell installed on a phone looked like the framework
# it was built with. For a store submission that is worse than cosmetic: Apple's
# 4.2 rejects template-looking apps, and a reviewer sees the icon first.
#
# SIZES ARE PRESERVED FROM WHAT CAPACITOR WROTE, deliberately: the native splash
# maths (and Android's density buckets) are built around these exact
# dimensions, so the art changes and nothing else does.
set -euo pipefail

src="assets/drop-in-icon.svg"
mark="assets/icon-foreground.png"
res="android/app/src/main/res"
brand="#e8552f"

[ -f "$src" ] || { echo "missing $src (run from the repo root)" >&2; exit 1; }
[ -d "$res" ] || { echo "missing $res (run 'npx cap add android' first)" >&2; exit 1; }

# The mark alone (no brand plate) at 1024, which is the source for both the
# adaptive foreground and the splash. Regenerated from the SVG so it can never
# drift from the icon.
python3 - "$src" /tmp/drop-in-mark.svg <<'PY'
import re, sys, pathlib
svg = pathlib.Path(sys.argv[1]).read_text()
out = re.sub(r'\n\s*<rect width="512" height="512" rx="112" fill="#e8552f"/>', '', svg)
assert out != svg, 'the brand plate was not found in the icon SVG'
pathlib.Path(sys.argv[2]).write_text(out)
PY
rsvg-convert -w 1024 -h 1024 /tmp/drop-in-mark.svg -o "$mark"

# 1. Launcher icons — the full art, at Android's five density buckets.
declare -A ICON=( [mdpi]=48 [hdpi]=72 [xhdpi]=96 [xxhdpi]=144 [xxxhdpi]=192 )
for d in "${!ICON[@]}"; do
  n="${ICON[$d]}"
  rsvg-convert -w "$n" -h "$n" "$src" -o "$res/mipmap-$d/ic_launcher.png"
  rsvg-convert -w "$n" -h "$n" "$src" -o "$res/mipmap-$d/ic_launcher_round.png"
done

# 2. Adaptive foregrounds — the MARK on transparency, at ~62% of the 108dp
# canvas, because Android's mask crops the outer ring. A mark drawn edge to edge
# loses its slide and its ball to the mask.
declare -A FORE=( [mdpi]=108 [hdpi]=162 [xhdpi]=216 [xxhdpi]=324 [xxxhdpi]=432 )
for d in "${!FORE[@]}"; do
  n="${FORE[$d]}"
  inner=$(( n * 62 / 100 ))
  magick -size "${n}x${n}" xc:none \( "$mark" -resize "${inner}x${inner}" \) \
    -gravity center -composite "$res/mipmap-$d/ic_launcher_foreground.png"
done

# 3. The adaptive icon's background colour, so the plate behind the mark is the
# brand terracotta rather than Capacitor's white.
cat > "$res/values/ic_launcher_background.xml" <<XML
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">${brand}</color>
</resources>
XML

# 4. Splash screens — the SAME art as the web splash (`scripts/build-splash.mjs`
# paints the mark on ${brand}), at exactly the dimensions Capacitor chose.
for p in "$res"/drawable*/splash.png; do
  [ -f "$p" ] || continue
  # ⚠️ THE `\n` IS LOAD-BEARING: `magick identify -format` prints with NO trailing
  # newline, and under `set -e` a `read` that hits EOF without its delimiter
  # returns non-zero and kills the script — silently, before step 5, which is how
  # the Capacitor vector foreground survived the first run.
  read -r w h < <(magick identify -format "%w %h\n" "$p")
  inner=$(( (w < h ? w : h) * 38 / 100 ))
  magick -size "${w}x${h}" xc:"$brand" \( "$mark" -resize "${inner}x${inner}" \) \
    -gravity center -composite "$p"
done

# 5. ⚠️ REMOVE THE VECTOR FOREGROUND. `drawable-v24/ic_launcher_foreground.xml` is
# a hand-written VECTOR of the Capacitor logo, and on API 24+ it OVERRIDES the
# mipmap PNGs above — leaving the framework's logo on the launcher of every
# modern device. It is deleted rather than rewritten: a correct vector would be a
# hand-transcribed path nobody can visually verify here, and the 432px PNG
# foreground is crisp at every density that matters.
rm -f "$res/drawable-v24/ic_launcher_foreground.xml"

echo "native assets regenerated from $src:"
echo "  launcher icons  : 5 densities (PNG, from the app's own art)"
echo "  adaptive fg     : the mark at 62% of the 108dp canvas"
echo "  splash          : $(ls "$res"/drawable*/splash.png | wc -l) files, sizes unchanged"
