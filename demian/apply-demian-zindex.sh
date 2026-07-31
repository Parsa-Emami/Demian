#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_ROOT="/c/Users/alienware/Documents/GitHub/Demian/demian"
DOWNLOADS="/c/Users/alienware/Downloads"

cd "$PROJECT_ROOT"

echo "== Demian z-index refactor =="

unzip -o "$DOWNLOADS/Demian-z-index-refactor.zip" -d "$DOWNLOADS/zindex-patch"

cp -rf "$DOWNLOADS/zindex-patch/demian/"* "$PROJECT_ROOT/"

bash scripts/apply-ui-layer-refactor.sh

echo "DONE"
