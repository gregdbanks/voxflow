#!/usr/bin/env bash
# Rebuild assets/icon.icns from assets/logo.svg.
# macOS-only (depends on qlmanage, sips, iconutil).
# Run this whenever the logo changes and commit the resulting .icns.

set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$here"

if [ ! -f assets/logo.svg ]; then
  echo "assets/logo.svg not found" >&2
  exit 1
fi

mkdir -p assets/icon.iconset
trap 'rm -rf assets/icon.iconset' EXIT

for size in 16 32 64 128 256 512 1024; do
  qlmanage -t -s "$size" -o /tmp/ assets/logo.svg >/dev/null 2>&1
  sips -z "$size" "$size" /tmp/logo.svg.png --out "assets/icon.iconset/_${size}.png" >/dev/null
done

# Apple's iconset naming convention — each logical size in @1x and @2x.
declare -A map=(
  [icon_16x16.png]=16
  [icon_16x16@2x.png]=32
  [icon_32x32.png]=32
  [icon_32x32@2x.png]=64
  [icon_128x128.png]=128
  [icon_128x128@2x.png]=256
  [icon_256x256.png]=256
  [icon_256x256@2x.png]=512
  [icon_512x512.png]=512
  [icon_512x512@2x.png]=1024
)

for name in "${!map[@]}"; do
  size="${map[$name]}"
  cp "assets/icon.iconset/_${size}.png" "assets/icon.iconset/${name}"
done

iconutil -c icns assets/icon.iconset
echo "wrote assets/icon.icns"
