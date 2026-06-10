#!/usr/bin/env bash
# Regenerates icon.iconset PNGs and icon.icns from icon.svg (the master).
# Follows the macOS Big Sur icon grid: 824x824 artwork on a 1024 canvas,
# 185.4 corner radius, 100px gutter, baked shadow.
set -euo pipefail

cd "$(dirname "$0")/.."

SVG="icon.svg"
SET="icon.iconset"

render() { # render <pixels> <outfile>
  rsvg-convert -w "$1" -h "$1" "$SVG" -o "$SET/$2"
}

render 16   icon_16x16.png
render 32   icon_16x16@2x.png
render 32   icon_32x32.png
render 64   icon_32x32@2x.png
render 128  icon_128x128.png
render 256  icon_128x128@2x.png
render 256  icon_256x256.png
render 512  icon_256x256@2x.png
render 512  icon_512x512.png
render 1024 icon_512x512@2x.png

iconutil -c icns "$SET" -o icon.icns
echo "Wrote icon.icns and $SET PNGs."
