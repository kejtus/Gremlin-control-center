#!/usr/bin/env bash
# Buduje instalowalne APK (telefon + Pi).
#
#   ./build-apk.sh            EAS w chmurze (domyślnie)
#   ./build-apk.sh --local    lokalnie przez Docker (eas build --local)
#   ./build-apk.sh --wait     czekaj na gotowy APK i wypisz link
#
# Uwaga: eas-cli czasem wywala „GraphQL request failed” przy flaky sieci,
# nawet gdy build już wystartował — skrypt wtedy dociąga status z API.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOBILE="$ROOT/mobile"
PROFILE="${EAS_PROFILE:-preview}"
LOCAL=0
WAIT=1
for arg in "$@"; do
  case "$arg" in
    --local) LOCAL=1 ;;
    --no-wait) WAIT=0 ;;
    --wait) WAIT=1 ;;
    --help|-h)
      sed -n '2,12p' "$0"
      exit 0
      ;;
  esac
done

log() { printf '%s\n' "$*"; }
die() { printf 'Błąd: %s\n' "$*" >&2; exit 1; }

need_cmd() { command -v "$1" >/dev/null 2>&1 || die "brak polecenia: $1"; }

expo_session() {
  python3 - <<'PY'
import json
from pathlib import Path
p = Path.home() / '.expo' / 'state.json'
d = json.loads(p.read_text())
auth = d.get('auth') or {}
s = auth.get('sessionSecret') or auth.get('accessToken')
if not s:
    raise SystemExit('Brak sesji Expo — uruchom: npx eas-cli login')
print(s)
PY
}

gql() {
  local query="$1"
  local session
  session="$(expo_session)"
  curl -sS -X POST https://api.expo.dev/graphql \
    -H 'content-type: application/json' \
    -H "expo-session: ${session}" \
    --connect-timeout 20 \
    --max-time 60 \
    -d "$(python3 -c 'import json,sys; print(json.dumps({"query":sys.argv[1]}))' "$query")"
}

latest_android_build() {
  gql 'query { app { byId(appId: "7b5d695b-b817-4300-b6f7-4ce0c15328a0") { builds(offset:0, limit:1, filter:{platform:ANDROID}) { id status createdAt appVersion appBuildVersion artifacts { buildUrl applicationArchiveUrl } } } } }'
}

print_build() {
  python3 - <<'PY'
import json,sys
d=json.load(sys.stdin)
b=((d.get("data") or {}).get("app") or {}).get("byId",{}).get("builds") or []
if not b:
    print("Brak buildów Android w projekcie.")
    raise SystemExit(2)
x=b[0]
arts=x.get("artifacts") or {}
url=arts.get("buildUrl") or arts.get("applicationArchiveUrl") or ""
print(f"id:      {x.get('id')}")
print(f"status:  {x.get('status')}")
print(f"created: {x.get('createdAt')}")
print(f"version: {x.get('appVersion')} ({x.get('appBuildVersion')})")
if url:
    print(f"APK:     {url}")
else:
    print("APK:     (jeszcze niedostępne)")
PY
}

wait_for_apk() {
  local tries="${1:-40}"
  local i status url
  for ((i=1; i<=tries; i++)); do
    local json
    json="$(latest_android_build)"
    status="$(printf '%s' "$json" | python3 -c 'import json,sys; b=((json.load(sys.stdin).get("data")or{}).get("app")or{}).get("byId",{}).get("builds")or[]; print((b[0].get("status") if b else ""))')"
    url="$(printf '%s' "$json" | python3 -c 'import json,sys; b=((json.load(sys.stdin).get("data")or{}).get("app")or{}).get("byId",{}).get("builds")or[]; a=(b[0].get("artifacts")or{}) if b else {}; print(a.get("buildUrl") or a.get("applicationArchiveUrl") or "")')"
    log "  [$i/$tries] status=$status"
    if [[ "$status" == "FINISHED" && -n "$url" ]]; then
      log ""
      log "APK gotowe:"
      log "  $url"
      return 0
    fi
    if [[ "$status" == "ERRORED" || "$status" == "CANCELED" ]]; then
      die "Build zakończony statusem: $status"
    fi
    sleep 15
  done
  die "Timeout — build jeszcze nie gotowy. Sprawdź: https://expo.dev/accounts/kejtusss-team/projects/rpilot/builds"
}

# --- start ---
need_cmd curl
need_cmd python3
need_cmd npx

# EAS robi `npm ci` z mobile/ — lock musi być zsynchronizowany.
cp -f "$ROOT/package-lock.json" "$MOBILE/package-lock.json"
cd "$MOBILE"

log "RPilot — budowanie APK (profil: ${PROFILE})"
if [[ "$LOCAL" -eq 1 ]]; then
  need_cmd docker
  log "  tryb: lokalny Docker (eas build --local)"
else
  log "  tryb: EAS cloud"
fi

# Zapamiętaj najnowszy build przed startem
BEFORE_ID="$(latest_android_build 2>/dev/null | python3 -c 'import json,sys; b=((json.load(sys.stdin).get("data")or{}).get("app")or{}).get("byId",{}).get("builds")or[]; print(b[0]["id"] if b else "")' || true)"

set +e
EAS_ARGS=(build --platform android --profile "$PROFILE" --non-interactive --no-wait)
if [[ "$LOCAL" -eq 1 ]]; then
  EAS_ARGS+=(--local)
fi

# Retry przy flaky GraphQL
ATTEMPTS=3
RC=1
for ((a=1; a<=ATTEMPTS; a++)); do
  log "  eas-cli próba $a/$ATTEMPTS…"
  NODE_OPTIONS="${NODE_OPTIONS:-} --dns-result-order=ipv4first" npx --yes eas-cli "${EAS_ARGS[@]}"
  RC=$?
  [[ "$RC" -eq 0 ]] && break
  log "  eas-cli exit=$RC — ponawiam za 4s…"
  sleep 4
done
set -e

# Nawet przy błędzie CLI sprawdź, czy powstał nowy build
AFTER_JSON="$(latest_android_build)"
AFTER_ID="$(printf '%s' "$AFTER_JSON" | python3 -c 'import json,sys; b=((json.load(sys.stdin).get("data")or{}).get("app")or{}).get("byId",{}).get("builds")or[]; print(b[0]["id"] if b else "")')"

log ""
log "Ostatni build w projekcie:"
printf '%s' "$AFTER_JSON" | print_build || true

if [[ -n "$AFTER_ID" && "$AFTER_ID" != "$BEFORE_ID" ]]; then
  log ""
  log "Nowy build wystartował ($AFTER_ID), mimo ewentualnego błędu CLI."
  if [[ "$WAIT" -eq 1 && "$LOCAL" -eq 0 ]]; then
    wait_for_apk 50
  fi
  exit 0
fi

if [[ "$RC" -ne 0 ]]; then
  die "eas-cli nie wystartował builda (GraphQL/sieć). Sprawdź internet albo: npx eas-cli login && ./build-apk.sh"
fi

if [[ "$WAIT" -eq 1 && "$LOCAL" -eq 0 ]]; then
  wait_for_apk 50
fi
exit 0
