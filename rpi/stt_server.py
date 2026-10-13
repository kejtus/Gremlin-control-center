#!/usr/bin/env python3
"""LAN STT + mikrofon-towarzysz.

HTTP  :8769  — API dla RPilot (Expo Go, bez certyfikatu)
HTTPS :8770  — strona /mic (secure context → mikrofon w przeglądarce telefonu, bez Google)
"""
from __future__ import annotations

import base64
import json
import os
import ssl
import subprocess
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from faster_whisper import WhisperModel

PORT = int(os.environ.get("STT_PORT", "8769"))
HTTPS_PORT = int(os.environ.get("STT_HTTPS_PORT", "8770"))
MODEL_SIZE = os.environ.get("STT_MODEL", "base")
LANG = os.environ.get("STT_LANG", "pl")
HERE = Path(__file__).resolve().parent
MIC_HTML = HERE / "mic_page.html"
CERT_DIR = Path.home() / ".cache" / "rpilot-stt" / "certs"

print(f"stt: ładuję Whisper {MODEL_SIZE} (pierwszy raz pobiera model)…", flush=True)
model = WhisperModel(MODEL_SIZE, device="cpu", compute_type="int8")
print("stt: model gotowy", flush=True)

lock = threading.Lock()
arm_cv = threading.Condition(lock)
armed = False
events: list[dict] = []
event_id = 0


def push_text(text: str) -> None:
    global event_id
    if not text:
        return
    with lock:
        event_id += 1
        events.append({"id": event_id, "text": text, "ts": time.time()})
        if len(events) > 80:
            del events[: len(events) - 80]


def set_armed(value: bool) -> None:
    global armed
    with arm_cv:
        armed = value
        arm_cv.notify_all()


def wait_armed(prev: bool, timeout: float = 25.0) -> bool:
    with arm_cv:
        deadline = time.time() + timeout
        while armed == prev and time.time() < deadline:
            arm_cv.wait(timeout=0.5)
        return armed


def transcribe_file(path: str) -> str:
    size = os.path.getsize(path)
    with open(path, "rb") as f:
        magic = f.read(16)
    print(f"stt: plik {path} size={size} magic={magic[:8]!r}", flush=True)
    if size < 64:
        raise RuntimeError("nagranie puste lub obcięte")

    try:
        return _whisper(path)
    except Exception as first:
        print(f"stt: bezpośredni odczyt nieudany: {first}", flush=True)

    wav = path + ".wav"
    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        path,
        "-ar",
        "16000",
        "-ac",
        "1",
        "-c:a",
        "pcm_s16le",
        wav,
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        # Drugi strzał: wymuś kontener (częsty problem z m4a z Androida).
        cmd2 = [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-f",
            "mp4",
            "-i",
            path,
            "-ar",
            "16000",
            "-ac",
            "1",
            "-c:a",
            "pcm_s16le",
            wav,
        ]
        proc2 = subprocess.run(cmd2, capture_output=True, text=True)
        if proc2.returncode != 0:
            err = (proc2.stderr or proc.stderr or "").strip() or f"ffmpeg exit {proc.returncode}"
            raise RuntimeError(f"ffmpeg nie odczytał nagrania: {err[:300]}")
    try:
        return _whisper(wav)
    finally:
        try:
            os.unlink(wav)
        except OSError:
            pass


def _whisper(path: str) -> str:
    # Krótkie komendy („idź”, „stop”) — niski próg no_speech + podpowiedź słownictwa.
    segments, info = model.transcribe(
        path,
        language=LANG,
        task="transcribe",
        vad_filter=False,
        beam_size=5,
        temperature=0.0,
        condition_on_previous_text=False,
        no_speech_threshold=0.4,
        compression_ratio_threshold=2.8,
        initial_prompt=(
            "Komendy robota po polsku: idź, jedź, stój, stop, w lewo, w prawo, "
            "do przodu, do tyłu, włącz, wyłącz."
        ),
    )
    text = "".join(seg.text for seg in segments).strip()
    print(
        f"stt: whisper lang={getattr(info, 'language', '?')} "
        f"prob={getattr(info, 'language_probability', 0):.2f} "
        f"chars={len(text)} → {text[:80]!r}",
        flush=True,
    )
    return text


def parse_body(raw: bytes, content_type: str, filename_hdr: str) -> tuple[bytes, str]:
    ctype = (content_type or "").split(";")[0].strip().lower()
    if ctype == "application/json":
        payload = json.loads(raw.decode("utf-8"))
        audio = base64.b64decode(payload["audio"])
        name = str(payload.get("name") or filename_hdr or "clip.m4a")
        return audio, name
    name = filename_hdr or "clip.bin"
    return raw, name


def ensure_certs() -> tuple[Path, Path]:
    CERT_DIR.mkdir(parents=True, exist_ok=True)
    cert, key = CERT_DIR / "cert.pem", CERT_DIR / "key.pem"
    if cert.exists() and key.exists():
        return cert, key
    subprocess.check_call(
        [
            "openssl",
            "req",
            "-x509",
            "-newkey",
            "rsa:2048",
            "-keyout",
            str(key),
            "-out",
            str(cert),
            "-days",
            "3650",
            "-nodes",
            "-subj",
            "/CN=rpilot-mic",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return cert, key


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args) -> None:
        print("stt:", fmt % args, flush=True)

    def _cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS, GET")

    def _bytes(self, code: int, body: bytes, content_type: str) -> None:
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _json(self, code: int, obj: dict) -> None:
        self._bytes(code, json.dumps(obj, ensure_ascii=False).encode("utf-8"), "application/json; charset=utf-8")

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        qs = parse_qs(parsed.query)
        if path in {"/", "/mic"}:
            html = MIC_HTML.read_bytes() if MIC_HTML.exists() else b"<p>brak mic_page.html</p>"
            self._bytes(200, html, "text/html; charset=utf-8")
            return
        if path == "/manifest.json":
            self._json(
                200,
                {
                    "name": "RPilot Mikrofon",
                    "short_name": "RPilot Mic",
                    "start_url": "/mic",
                    "display": "standalone",
                    "background_color": "#121212",
                    "theme_color": "#334050",
                },
            )
            return
        if path == "/health":
            with lock:
                self._json(200, {"ok": True, "model": MODEL_SIZE, "armed": armed, "events": event_id})
            return
        if path == "/events":
            after = int((qs.get("after") or ["0"])[0] or 0)
            with lock:
                batch = [e for e in events if e["id"] > after]
            self._json(200, {"events": batch, "last": batch[-1]["id"] if batch else after, "armed": armed})
            return
        if path == "/wait":
            prev = (qs.get("armed") or ["0"])[0] == "1"
            now = wait_armed(prev)
            self._json(200, {"armed": now})
            return
        self._json(404, {"error": "not found"})

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        length = int(self.headers.get("Content-Length") or "0")
        raw = self.rfile.read(length) if length > 0 else b""

        if path == "/arm":
            set_armed(True)
            self._json(200, {"armed": True})
            return
        if path == "/disarm":
            set_armed(False)
            self._json(200, {"armed": False})
            return
        if path != "/stt":
            self._json(404, {"error": "not found"})
            return
        if length <= 0 or length > 8_000_000:
            self._json(400, {"error": "puste albo za długie nagranie"})
            return
        try:
            audio, name = parse_body(raw, self.headers.get("Content-Type") or "", self.headers.get("X-Filename") or "")
        except Exception:
            self._json(400, {"error": "nieczytelne nagranie"})
            return
        ext = os.path.splitext(name)[1].lower() or ".m4a"
        if ext not in {".m4a", ".mp4", ".aac", ".wav", ".webm", ".3gp", ".caf", ".ogg", ".mp3"}:
            ext = ".m4a"
        fd, tmp = tempfile.mkstemp(suffix=ext, prefix="rpilot-stt-")
        try:
            os.write(fd, audio)
            os.close(fd)
            fd = -1
            text = transcribe_file(tmp)
        except Exception as exc:
            self._json(500, {"error": f"rozpoznawanie nieudane: {exc}"})
            return
        finally:
            if fd >= 0:
                os.close(fd)
            try:
                os.unlink(tmp)
            except OSError:
                pass
        push_text(text)
        set_armed(False)
        self._json(200, {"text": text})


def serve_http() -> None:
    httpd = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"stt: HTTP  :{PORT}  (RPilot API)", flush=True)
    httpd.serve_forever()


def serve_https() -> None:
    cert, key = ensure_certs()
    httpd = ThreadingHTTPServer(("0.0.0.0", HTTPS_PORT), Handler)
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.load_cert_chain(certfile=str(cert), keyfile=str(key))
    httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)
    print(f"stt: HTTPS :{HTTPS_PORT}/mic  (mikrofon telefonu, certyfikat self-signed)", flush=True)
    httpd.serve_forever()


if __name__ == "__main__":
    threading.Thread(target=serve_https, daemon=True).start()
    serve_http()
