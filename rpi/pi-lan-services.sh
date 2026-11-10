#!/usr/bin/env bash
# Usługi LAN na Raspberry Pi — kamera dla tabletu BEZ PC i BEZ internetu.
#
# Gremlin wysyła JPEG UDP na sink (tu: 127.0.0.1:9000).
# Ten mostek zbiera UDP i oddaje klatki tabletom: ws://<IP_PI>:8766
# (gdy panel :3000/video nie wystarczy).
#
#   chmod +x rpi/pi-lan-services.sh
#   ./rpi/pi-lan-services.sh
#
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UDP_PORT="${VIDEO_UDP_PORT:-9000}"
WS_PORT="${VIDEO_WS_PORT:-8766}"

pkill -f 'rpi/video_bridge.js' 2>/dev/null || true
pkill -f 'rpi/video_bridge.py' 2>/dev/null || true
sleep 0.3

if command -v node >/dev/null 2>&1 && [[ -f "$ROOT/rpi/video_bridge.js" ]]; then
  echo "Video bridge (node): UDP :${UDP_PORT} → ws://0.0.0.0:${WS_PORT}"
  VIDEO_UDP_PORT="$UDP_PORT" VIDEO_WS_PORT="$WS_PORT" \
    node "$ROOT/rpi/video_bridge.js" &
elif command -v python3 >/dev/null 2>&1 && [[ -f "$ROOT/rpi/video_bridge.py" ]]; then
  echo "Video bridge (python): UDP :${UDP_PORT} → ws://0.0.0.0:${WS_PORT}"
  python3 "$ROOT/rpi/video_bridge.py" --udp-port "$UDP_PORT" --ws-port "$WS_PORT" &
else
  echo "Brak node/python3 — nie uruchomiono mostka. Użyj panelu Gremlina :3000/video." >&2
  exit 1
fi

echo "OK. Na tablecie (APK) połącz z IP tego Pi — kamera idzie po LAN (WS)."
echo "Trzymaj ten proces + Gremlin (python -m src.main)."
wait
