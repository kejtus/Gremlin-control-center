#!/usr/bin/env bash
# Buduje Android APK (preview) oraz iOS IPA (ios-preview) w EAS.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cp -f "$ROOT/package-lock.json" "$ROOT/mobile/package-lock.json"
cd "$ROOT/mobile"
npx eas-cli build --platform android --profile preview --non-interactive --no-wait "$@"
npx eas-cli build --platform ios --profile ios-preview --non-interactive --no-wait "$@" || {
  echo "iOS: jeśli credentials brak — uruchom interaktywne: npm run ipa" >&2
  exit 1
}
