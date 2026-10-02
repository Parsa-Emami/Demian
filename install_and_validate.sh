#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/demian"
npm ci
npm run test:ci
npm run validate:final
npm run validate:ui-layers
python3 -c 'import PIL' || python3 -m pip install Pillow
npm run validate:darya:v13
npm run build:static
npm run validate:build
echo "Ready: demian/_site — serve this directory over HTTP."

