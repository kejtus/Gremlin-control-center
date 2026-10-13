#!/usr/bin/env bash
# Serwisy deweloperskie na tym komputerze (podgląd UI / Expo Go).
# Cały ruch (sterowanie, kamera, STT) idzie po LAN — internet nie jest potrzebny.
# Docelowo: APK na telefonie + Pi (bez PC):
#   ./build-apk.sh
#   ./start.sh        Expo + mostek kamery + proxy do Pi (tylko Expo Go)
#   ./start.sh --ui   samo Expo (praca nad wyglądem)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXPO_BIN="$ROOT/node_modules/.bin/expo"
BRIDGE_JS="$ROOT/rpi/video_bridge.js"
EXPO_PORT="${EXPO_PORT:-41782}"
BRIDGE_PORT="${VIDEO_WS_PORT:-8766}"
CONTROL_PORT="${CONTROL_PROXY_PORT:-8768}"
STT_PORT="${STT_PORT:-8769}"
STT_HTTPS_PORT="${STT_HTTPS_PORT:-8770}"
UDP_PORT="${VIDEO_UDP_PORT:-9000}"
GREMLIN_HOST="${GREMLIN_HOST:-192.168.1.215}"
PROXY_JS="$ROOT/rpi/control_proxy.js"
UI_ONLY=0
if [[ "${1:-}" == "--ui" || "${1:-}" == "ui" ]]; then
  UI_ONLY=1
fi

PIDS=()

log() { printf '%s\n' "$*"; }
die() { printf 'Błąd: %s\n' "$*" >&2; exit 1; }

port_busy() {
  ss -ltn 2>/dev/null | grep -qE ":$1[[:space:]]"
}

# IP LAN wyłącznie z lokalnych tras / interfejsów (bez DNS i bez 1.1.1.1).
lan_ip() {
  local ip
  ip="$(pc_ip_toward "$GREMLIN_HOST" 2>/dev/null || true)"
  if [[ -n "$ip" ]]; then
    printf '%s\n' "$ip"
    return 0
  fi
  ip="$(hostname -I 2>/dev/null | awk '{for (i=1;i<=NF;i++) if ($i !~ /^127\./ && $i !~ /^172\.(1[7-9]|2[0-9]|3[01])\./) {print $i; exit}}')"
  if [[ -n "$ip" ]]; then
    printf '%s\n' "$ip"
    return 0
  fi
  ip -4 -o addr show scope global 2>/dev/null | awk '/inet /{split($4,a,"/"); if (a[1] !~ /^172\.(1[7-9]|2[0-9]|3[01])\./) {print a[1]; exit}}'
}

# IP tego PC widziane „w stronę” Pi — sink UDP kamery (nie IP z hotspotu/VPN).
pc_ip_toward() {
  local host="$1"
  ip -4 route get "$host" 2>/dev/null | awk '{for (i=1;i<=NF;i++) if ($i=="src") {print $(i+1); exit}}'
}

pi_reachable() {
  local host="$1"
  # szybki TCP probe :8765 (WS Gremlina)
  timeout 1 bash -c "echo >/dev/tcp/${host}/8765" 2>/dev/null
}

cleanup() {
  local pid
  for pid in "${PIDS[@]+"${PIDS[@]}"}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

if [[ ! -x "$EXPO_BIN" && ! -f "$EXPO_BIN" ]]; then
  die "brak Expo ($EXPO_BIN). W katalogu projektu: npm install"
fi
if [[ "$UI_ONLY" -eq 0 ]]; then
  if [[ ! -f "$BRIDGE_JS" ]]; then
    die "brak mostka kamery ($BRIDGE_JS)"
  fi
  if [[ ! -f "$PROXY_JS" ]]; then
    die "brak proxy sterowania ($PROXY_JS)"
  fi
fi

if [[ ! -e "$ROOT/mobile/package.json" ]]; then
  ln -s ../package.json "$ROOT/mobile/package.json"
fi
if [[ ! -e "$ROOT/mobile/node_modules" ]]; then
  ln -s ../node_modules "$ROOT/mobile/node_modules"
fi

unset EXPO_PUBLIC_ROBOT_HOST || true
export BROWSER="${BROWSER:-none}"
# Metro/Expo bez telefonowania do expo.dev (izolowana Wi‑Fi bez internetu).
# Nie ustawiaj CI=1 — wtedy Metro wyłącza reload (apka „nie chce się odpalić” / zamraża).
export EXPO_OFFLINE="${EXPO_OFFLINE:-1}"
export EXPO_NO_TELEMETRY="${EXPO_NO_TELEMETRY:-1}"
unset CI || true

LAN_IP="$(lan_ip || true)"
LAN_IP="${LAN_IP:-?}"
if [[ -n "$LAN_IP" && "$LAN_IP" != "?" ]]; then
  export REACT_NATIVE_PACKAGER_HOSTNAME="$LAN_IP"
fi

log "RPilot — start serwisów"
log "  katalog: $ROOT"
log "  PC LAN: ${LAN_IP}  Pi: ${GREMLIN_HOST}"
log "  tryb: LAN / offline (EXPO_OFFLINE=${EXPO_OFFLINE}) — internet nie jest wymagany"

if [[ "$UI_ONLY" -eq 1 ]]; then
  pkill -f 'rpi/video_bridge.js' 2>/dev/null || true
  pkill -f 'rpi/control_proxy.js' 2>/dev/null || true
  # Apka nie łączy się z Pi (web + Expo Go) — czysta atrapa UI.
  export EXPO_PUBLIC_UI_ONLY=1
  unset EXPO_PUBLIC_ROBOT_HOST || true
  log "  tryb UI — bez Pi, EXPO_PUBLIC_UI_ONLY=1"
else
  unset EXPO_PUBLIC_UI_ONLY || true
  # Stare procesy zostawiały mostek z poprzedniego kodu — zawsze odpalamy świeży.
  pkill -f 'rpi/video_bridge.js' 2>/dev/null || true
  pkill -f 'rpi/control_proxy.js' 2>/dev/null || true
  sleep 0.35

  SINK_IP="$(pc_ip_toward "$GREMLIN_HOST" || true)"
  SINK_IP="${SINK_IP:-$LAN_IP}"
  if [[ -n "$SINK_IP" && "$SINK_IP" != "?" ]]; then
    export EXPO_PUBLIC_VIDEO_SINK_HOST="$SINK_IP"
    export EXPO_PUBLIC_DEV_SERVER_HOST="$SINK_IP"
    log "  sink kamery (Pi → PC): ${SINK_IP}:${UDP_PORT}"
    log "  Expo Go (LAN): exp://${SINK_IP}:${EXPO_PORT}  — bez internetu, ta sama Wi‑Fi"
  else
    unset EXPO_PUBLIC_VIDEO_SINK_HOST || true
    unset EXPO_PUBLIC_DEV_SERVER_HOST || true
  fi
  if [[ -n "$LAN_IP" && "$LAN_IP" != "?" ]]; then
    export EXPO_PUBLIC_DEV_SERVER_HOST="${EXPO_PUBLIC_DEV_SERVER_HOST:-$LAN_IP}"
  fi

  if ! pi_reachable "$GREMLIN_HOST"; then
    log "  UWAGA: Pi ${GREMLIN_HOST}:8765 nieosiągalne z tego PC (teraz: ${LAN_IP})."
    log "  Połącz PC i telefon z tą samą Wi‑Fi co robot — inaczej nie będzie klatek kamery."
  fi

  node "$BRIDGE_JS" &
  PIDS+=("$!")
  log "  mostek kamery UDP :${UDP_PORT} → ws://0.0.0.0:${BRIDGE_PORT}  (pid ${PIDS[-1]})"

  GREMLIN_HOST="$GREMLIN_HOST" node "$PROXY_JS" &
  PIDS+=("$!")
  log "  proxy telefonu :${CONTROL_PORT} → ${GREMLIN_HOST}:8765  (pid ${PIDS[-1]})"
fi

# Głos z telefonu: nagranie → Whisper na tym PC (LAN). Instalacja pip tylko gdy jest net.
pkill -f 'rpi/stt_server.py' 2>/dev/null || true
STT_VENV="${HOME}/.cache/rpilot-stt/venv"
STT_PY="${STT_VENV}/bin/python"
STT_SCRIPT="$ROOT/rpi/stt_server.py"
if [[ -f "$STT_SCRIPT" ]]; then
  if ! "$STT_PY" -c "import faster_whisper" >/dev/null 2>&1; then
    if ping -c1 -W1 1.1.1.1 >/dev/null 2>&1 || ping -c1 -W1 8.8.8.8 >/dev/null 2>&1; then
      log "  STT: instaluję Whisper (tylko raz, ~/.cache/rpilot-stt)…"
      mkdir -p "$(dirname "$STT_VENV")"
      python3 -m venv "$STT_VENV"
      "$STT_VENV/bin/pip" install -U pip faster-whisper
    else
      log "  STT: brak faster-whisper i brak internetu — pomijam (sterowanie/kamera OK)."
      STT_SCRIPT=""
    fi
  fi
  if [[ -n "$STT_SCRIPT" && -x "$STT_PY" ]]; then
    STT_PORT="$STT_PORT" STT_HTTPS_PORT="$STT_HTTPS_PORT" "$STT_PY" "$STT_SCRIPT" &
    PIDS+=("$!")
    log "  STT Whisper :${STT_PORT}  mic HTTPS :${STT_HTTPS_PORT}/mic  (pid ${PIDS[-1]})"
  fi
fi

if port_busy "$EXPO_PORT"; then
  log "  Expo już działa na :${EXPO_PORT}"
  log "  Jeśli telefon nie wchodzi — to pewnie stary proces z --localhost. Zatrzymaj go i odpal ./start.sh od nowa."
else
  (
    cd "$ROOT/mobile"
    # --host lan: telefon ↔ PC po Wi‑Fi lokalnej (bez tunelu).
    # EXPO_OFFLINE=1 (wyżej): bez zapytań do expo.dev — NIE łącz z --offline w CLI
    # (Expo 57: "Specify at most one of: --offline, --host, …").
    # --web: przeglądarka na PC.
    exec "$EXPO_BIN" start --web --port "$EXPO_PORT" --host lan
  ) &
  PIDS+=("$!")
  log "  Expo LAN (pid ${PIDS[-1]}, EXPO_OFFLINE=${EXPO_OFFLINE})"
fi

log ""
if [[ "$UI_ONLY" -eq 1 ]]; then
  log "Podgląd UI: http://localhost:${EXPO_PORT}  lub  http://${LAN_IP}:${EXPO_PORT}"
  log "Telefon (bez internetu): http://${LAN_IP}:${EXPO_PORT}  — nie używaj Expo Go jeśli Wi‑Fi bez netu."
  log "  STT (głos): http://${LAN_IP}:${STT_PORT}/stt"
  log "  Mikrofon telefonu: https://${LAN_IP}:${STT_HTTPS_PORT}/mic  (zaakceptuj certyfikat, potem Add to Home Screen)"
  log "Bez Pi — nic nie łączy się z robotem."
else
  log "Na Pi: python -m src.main"
  log "Bez internetu (ta sama Wi‑Fi / router):"
  log "  1) Telefon przeglądarka: http://${LAN_IP}:${EXPO_PORT}"
  log "  2) albo Expo Go (wymaga wcześniejszego zainstalowania): exp://${LAN_IP}:${EXPO_PORT}"
  log "  3) APK → bezpośrednio Pi ws://${GREMLIN_HOST}:8765 (bez PC przy sterowaniu)"
  log "Ruch teraz: telefon ↔ ${LAN_IP} (proxy/mostek) ↔ ${GREMLIN_HOST}:8765"
  log "  sterowanie: ws://${LAN_IP}:${CONTROL_PORT}  kamera: ws://${LAN_IP}:${BRIDGE_PORT}"
  log "  głos API: http://${LAN_IP}:${STT_PORT}/stt   mikrofon: https://${LAN_IP}:${STT_HTTPS_PORT}/mic"
  log "Na :8765 Gremlin = 1 klient. Proxy zajmuje slot tylko gdy klient jest podłączony."
fi
log "Ctrl+C zatrzymuje to, co ten skrypt sam uruchomił."
log ""

if [[ ${#PIDS[@]} -eq 0 ]]; then
  log "Nic nowego nie startowałem — oba porty były zajęte."
  trap - EXIT INT TERM
  exit 0
fi

wait -n "${PIDS[@]}" || true
exit 1
