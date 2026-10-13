"""
Wklej do Gremlina (`command_processor.py`).

App wysyła po WebSocket (nie przez stronę :3000):

{
  "type": "device_power_status",
  "devices": {
    "OAK-D": true,
    "LIDAR": true,
    "MIC": false,
    "SPEAKER": true
  }
}

Opcjonalnie odpytanie: { "type": "get_device_power" }
→ odpowiedź tym samym kształtem device_power_status.
"""

from __future__ import annotations

SNIPPET = r'''
        elif cmd.get("type") == "device_power_status":
            devices = cmd.get("devices") or {}
            if not hasattr(self, "_rpilot_device_power"):
                self._rpilot_device_power = {
                    "OAK-D": True,
                    "LIDAR": True,
                    "MIC": True,
                    "SPEAKER": True,
                }
            for key in ("OAK-D", "LIDAR", "MIC", "SPEAKER"):
                if key in devices:
                    self._rpilot_device_power[key] = bool(devices[key])
            # Tu podłącz realne włączanie kamer/lidar/mic/speaker.
            return {
                "type": "device_power_status",
                "devices": dict(self._rpilot_device_power),
            }

        elif cmd.get("type") == "get_device_power":
            if not hasattr(self, "_rpilot_device_power"):
                self._rpilot_device_power = {
                    "OAK-D": True,
                    "LIDAR": True,
                    "MIC": True,
                    "SPEAKER": True,
                }
            return {
                "type": "device_power_status",
                "devices": dict(self._rpilot_device_power),
            }
'''

if __name__ == "__main__":
    print(SNIPPET)
