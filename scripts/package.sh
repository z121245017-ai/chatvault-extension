#!/usr/bin/env bash
# Build the Chrome Web Store upload zip with runtime files only.
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION=$(python3 -c "import json;print(json.load(open('manifest.json'))['version'])")
OUT="dist/chatvault-extension-v${VERSION}.zip"
mkdir -p dist
rm -f "$OUT"
zip -q -r -X "$OUT" \
  manifest.json popup.html popup.css popup.js content.js \
  src/extractor/chat_extractor.js src/formatter/markdown_exporter.js src/samples/builtin_sample.js \
  icons assets/wechat-coffee-light.png \
  -x '*.DS_Store'
echo "$OUT"
unzip -l "$OUT" | tail -n +4 | sed '$d' | sed '$d' | awk '{print $4}'
