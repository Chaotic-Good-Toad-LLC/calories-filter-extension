#!/usr/bin/env bash
# Builds the store zips from an explicit allow-list, so dev files (test/, package.json,
# node_modules/) never ship. Run from anywhere: scripts/package.sh
set -euo pipefail

cd "$(dirname "$0")/.."

FILES=(manifest.json content.js styles.css src icons)
OUTPUTS=(bjvk-filter-chrome.zip calories-filter-firefox.zip)

for out in "${OUTPUTS[@]}"; do
    rm -f "$out"
    zip -r -X -q "$out" "${FILES[@]}" -x '*.DS_Store'
    echo "Built $out"
done
