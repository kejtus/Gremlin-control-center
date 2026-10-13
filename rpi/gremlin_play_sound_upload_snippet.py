"""
Wklej tę gałąź w Gremlinie zamiast istniejącego `play_sound` w
`src/services/command_processor.py` — wtedy telefon może wysłać MP3
w polu `audio_b64` i Pi zapisze je do /tmp oraz odtworzy.

Przykładowa wiadomość z RPilot:
{
  "type": "play_sound",
  "file": "sounds/moj-plik.mp3",
  "volume": 1,
  "audio_b64": "<base64>"
}
"""

from __future__ import annotations

# --- wklej do CommandProcessor (zamiast starego elif play_sound) -----------
SNIPPET = r'''
        elif cmd.get("type") == "play_sound":
            file_path = cmd.get("file")
            volume = cmd.get("volume", 1.0)
            audio_b64 = cmd.get("audio_b64")
            if audio_b64:
                import base64
                import tempfile
                from pathlib import Path
                try:
                    raw = base64.b64decode(audio_b64, validate=False)
                except Exception as exc:
                    print(f"play_sound: zły audio_b64: {exc}")
                    return
                if not raw:
                    print("play_sound: pusty audio_b64")
                    return
                suffix = Path(str(file_path or "upload.mp3")).suffix or ".mp3"
                if suffix.lower() not in (".mp3", ".wav", ".ogg", ".m4a"):
                    suffix = ".mp3"
                tmp = Path(tempfile.gettempdir()) / f"rpilot_upload{suffix}"
                try:
                    tmp.write_bytes(raw)
                except OSError as exc:
                    print(f"play_sound: nie zapisano uploadu: {exc}")
                    return
                file_path = str(tmp)
            if file_path:
                self.speaker.play(file_path, volume=volume)
            else:
                print("play_sound command missing 'file' parameter")
'''


if __name__ == "__main__":
    print(SNIPPET)
