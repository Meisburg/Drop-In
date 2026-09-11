#!/usr/bin/env bash
# Regenerate the Drop In raster icons from assets/drop-in-icon.svg.
# Requires rsvg-convert (librsvg). Run from the repo root.
set -euo pipefail

src="assets/drop-in-icon.svg"
[ -f "$src" ] || { echo "missing $src (run from the repo root)" >&2; exit 1; }

rsvg-convert -w 180 -h 180 "$src" -o public/apple-touch-icon.png
rsvg-convert -w 192 -h 192 "$src" -o public/pwa-192x192.png
rsvg-convert -w 512 -h 512 "$src" -o public/pwa-512x512.png
rsvg-convert -w 512 -h 512 "$src" -o public/pwa-maskable-512x512.png

echo "icons regenerated:"
ls -la public/apple-touch-icon.png public/pwa-*.png
