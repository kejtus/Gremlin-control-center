#!/usr/bin/env bash
# Buduje IPA (iOS) — instalacja przez link EAS / TestFlight (wymaga Apple Developer).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cp -f "$ROOT/package-lock.json" "$ROOT/mobile/package-lock.json"
cd "$ROOT/mobile"
exec npx eas-cli build --platform ios --profile ios-preview "$@"
