#!/usr/bin/env bash
set -euo pipefail
python3 apply_latest_c938504_hotfix.py
cd demian
php artisan optimize:clear
php artisan migrate:fresh --seed --force
php artisan test --stop-on-failure
npm run test:ci
npm run validate:final
npm run build
npm run validate:build
