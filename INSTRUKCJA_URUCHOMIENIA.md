# RPilot — instrukcja uruchamiania

Przewodnik dla nowej maszyny (Linux / macOS). Opisuje pełny tor: **Raspberry Pi (Gremlin) → komputer deweloperski → telefon (Expo Go lub APK)**.

---

## Spis treści

1. [Co to jest](#1-co-to-jest)
2. [Wymagania](#2-wymagania)
3. [Klonowanie i instalacja](#3-klonowanie-i-instalacja)
4. [Raspberry Pi — Gremlin](#4-raspberry-pi--gremlin)
5. [Tryb developerski (Expo Go + PC)](#5-tryb-developerski-expo-go--pc)
6. [Tryb produkcyjny (APK bez PC)](#6-tryb-produkcyjny-apk-bez-pc)
7. [Porty i ruch w sieci](#7-porty-i-ruch-w-sieci)
8. [Sprawdzenie, że działa](#8-sprawdzenie-że-działa)
9. [Typowe problemy](#9-typowe-problemy)
10. [Zmienne środowiskowe](#10-zmienne-środowiskowe)

---

## 1. Co to jest

**RPilot** to aplikacja mobilna do robota [Gremlin](https://github.com/frykol/gremlin/tree/websocket-rewrite).

| Element | Rola |
| --- | --- |
| **Raspberry Pi** | Gremlin (`python -m src.main`) — sterowanie WS `:8765`, panel `:3000`, kamera UDP |
| **Komputer (PC)** | Tylko przy Expo Go: Metro, proxy sterowania, mostek kamery |
| **Telefon** | Expo Go (dev) albo APK (bezpośrednio do Pi) |

```
Expo Go (dev):
  Telefon  ←LAN→  PC (proxy :8768, mostek :8766, Metro :41782)  ←LAN→  Pi :8765

APK (docelowo):
  Telefon  ←LAN→  Pi :8765   (+ UDP kamery na telefon)
```

> Internet **nie jest wymagany** do sterowania ani kamery, o ile telefon, PC i Pi są w **tej samej sieci Wi‑Fi** (router lokalny).

---

## 2. Wymagania

### Komputer (dev)

| Narzędzie | Wersja / uwagi |
| --- | --- |
| Node.js | **20+** |
| npm | bundlowany z Node |
| Python 3 | opcjonalnie (STT Whisper / symulator) |
| Bash | `./start.sh`, skrypty build |

### Telefon

| Platforma | Dev | Produkcja |
| --- | --- | --- |
| Android | Expo Go | APK (`./build-apk.sh`) |
| HarmonyOS (z Androidem) | Expo Go / APK | ten sam APK |
| iOS | Expo Go | IPA (`./build-ipa.sh`, konto Apple) |
| HarmonyOS NEXT | — | nie wspierane |

### Sieć

- Telefon, PC i Pi w **jednej** sieci lokalnej (nie „gościnne Wi‑Fi” z izolacją klientów).
- Bez VPN rozdzielającego ruch LAN.
- Domyślne IP Pi w projekcie: `192.168.1.215` (zmień przez `GREMLIN_HOST`).

---

## 3. Klonowanie i instalacja

### Opcja A — Cursor Origin

```bash
curl -fsSL https://downloads.cursor.com/origin/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"

origin auth login
origin repo clone katarzyna-tylutka/mobile-rpi-robot-ctrl
cd mobile-rpi-robot-ctrl
```

Repo: `https://origin.cursor.com/katarzyna-tylutka/mobile-rpi-robot-ctrl`

### Opcja B — już masz katalog

```bash
cd /ścieżka/do/mobile-rpi-robot-ctrl
```

### Zależności Node

Z **korzenia** repozytorium:

```bash
npm install
```

(`mobile/package.json` i `mobile/node_modules` są linkowane przez `./start.sh`.)

---

## 4. Raspberry Pi — Gremlin

Na malinie (osobne repo Gremlina, gałąź `websocket-rewrite`):

```bash
# katalog Gremlina na Pi
python -m src.main
```

Po starcie powinny być dostępne:

| Usługa | Adres |
| --- | --- |
| Panel | `http://<IP_PI>:3000` |
| Sterowanie WS | `ws://<IP_PI>:8765` |
| Konfiguracja | `http://<IP_PI>:3000/api/robot-config` |

Opcjonalnie — discovery UDP (APK znajdzie robota sam; Expo Go zwykle wymaga ręcznego IP):

```bash
# z tego repo, na Pi albo w tej samej sieci
python rpi/gremlin_discover.py
```

### Ważne zachowanie Gremlina

Na porcie `:8765` jest **jeden** klient WebSocket.

Bez włączonego **program managera** Gremlin **ignoruje** komendy `motor`, `stream` i `register_video_sink`.  
RPilot po połączeniu sam wysyła `set_program_status: on` oraz heartbeat `get_program_status` co 500 ms.

Zamknij panel w przeglądarce na Pi, jeśli telefon ma przejąć slot WS (albo odwrotnie — panel zastąpi telefon).

---

## 5. Tryb developerski (Expo Go + PC)

Zalecany sposób pracy nad UI i protokołem.

### 5.1. Przygotowanie telefonu

1. Zainstaluj **Expo Go** (Google Play / App Store).
2. Podłącz telefon do **tej samej Wi‑Fi** co PC i Pi.

### 5.2. Start serwisów na PC

Z korzenia repo:

```bash
# opcjonalnie — IP Twojego Pi
export GREMLIN_HOST=192.168.1.215

./start.sh
```

Skrypt uruchamia:

| Serwis | Port | Opis |
| --- | --- | --- |
| Metro / Expo | `41782` | bundel JS dla Expo Go / przeglądarki |
| Mostek kamery | UDP `9000` → WS `8766` | Pi → PC → telefon |
| Proxy sterowania | `8768` → Pi `8765` | telefon nie zajmuje Pi „obok” Metro |
| STT (Whisper) | `8769` / HTTPS `8770` | głos (opcjonalnie) |

Tryb tylko UI (bez Pi):

```bash
./start.sh --ui
```

### 5.3. Otwarcie aplikacji

W logu `./start.sh` zobaczysz m.in.:

```text
Expo Go (LAN): exp://192.168.x.x:41782
```

Na telefonie:

1. Otwórz w Expo Go adres `exp://<IP_PC>:41782`  
   (albo zeskanuj QR z Metro — **lokalny**, nie z chmury Expo).
2. Wpisz IP Pi (np. `192.168.1.215`) i połącz.
3. Status **Program: ON**, drążek, kamera.

> Przy Wi‑Fi **bez internetu** lepiej nie polegać na skanowaniu QR z serwisów Expo — wpisz `exp://…` ręcznie. Metro działa z `EXPO_OFFLINE=1`.

### 5.4. Przeglądarka na PC

```text
http://localhost:41782
# lub
http://<IP_PC>:41782
```

---

## 6. Tryb produkcyjny (APK — tylko LAN, bez PC, bez internetu)

Tablet ↔ Raspberry Pi w **tej samej Wi‑Fi**. Nie potrzeba `./start.sh` na PC ani dostępu do internetu.

| Funkcja | Jak działa offline |
| --- | --- |
| Sterowanie | `ws://<IP_PI>:8765` |
| Kamera | APK: UDP JPEG na tablet `:9000` (sink = IP tabletu); zapas `ws://Pi:3000/video` |
| LiDAR | APK: UDP ELDP na tablet `:5010` (`esp_lidar.forward_host` = IP tabletu) |
| Mowa | Vosk offline w APK |

### Na Raspberry Pi

1. Gremlin (`python -m src.main`) — WS `:8765`, OAK-D, stream ON.
2. Kamera: apka sama rejestruje `register_video_sink` na IP tabletu `:9000`.
3. ESP LiDAR forward w `config.json` (IP tabletu z zakładki LiDAR w apce):

```json
"esp_lidar": {
  "forward_host": "192.168.x.x",
  "forward_port": 5010,
  "max_datagram_size": 1400
}
```

Restart Gremlin po zmianie configu.

### Build APK (EAS)

```bash
npx eas-cli login
./build-apk.sh --wait
```

### Po instalacji na tablecie

1. Tablet i Pi w tej samej sieci (router może być **bez** internetu).
2. Odinstaluj starą RPilot → zainstaluj APK.
3. Podaj IP Pi → sterowanie, kamera i głos lokalnie.

### iOS

```bash
npm run ipa
# pierwszy raz najlepiej interaktywne:
cd mobile && npx eas-cli build -p ios --profile ios-preview
```

---

## 7. Porty i ruch w sieci

| Port | Protokół | Gdzie | Rola |
| --- | --- | --- | --- |
| `8765` | WebSocket | Pi | sterowanie (`motor`, `stream`, `set_program_status`, …) |
| `3000` | HTTP | Pi | panel Gremlin Control |
| `45454` | UDP | Pi (+ sidecar) | discovery `GREMLIN_DISCOVER` |
| `9000` | UDP | Pi (localhost) / PC (Expo) | klatki JPEG kamery (sink) |
| `8766` | WebSocket | Pi (APK) / PC (Expo Go) | mostek kamery → tablet |
| `8768` | WebSocket | PC | proxy telefon → Pi |
| `41782` | HTTP | PC | Metro / Expo |
| `8769` / `8770` | HTTP(S) | PC | STT / mikrofon |

### Pakiety sterowania (przykład)

```json
{ "type": "motor", "channel": 0, "pwm": 1500 }
{ "type": "set_program_status", "status": "on" }
{ "type": "register_video_sink", "host": "192.168.1.163", "port": 9000 }
{ "type": "stream", "enabled": true }
{ "type": "get_program_status" }
```

PWM: **0–4095**, 8 kanałów. Cisza ~350 ms = stop bezpieczeństwa.

---

## 8. Sprawdzenie, że działa

| Krok | Oczekiwany efekt |
| --- | --- |
| Połączenie | Status online, nazwa Gremlin |
| Program | **ON** (w Statusie) |
| Drążek ~1 s | Koła / ruch (uważaj na stół) |
| Puszczenie / STOP | PWM → 0 |
| Kamera (Expo Go) | Klatki przez mostek PC (`:8766`) |
| Panel Pi | `http://<IP_PI>:3000` |

Szybki test z PC (gdy `./start.sh` działa):

```bash
# Pi odpowiada na WS?
timeout 1 bash -c 'echo >/dev/tcp/192.168.1.215/8765' && echo OK

# Metro
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:41782/status
```

---

## 9. Typowe problemy

| Objaw | Co zrobić |
| --- | --- |
| Apka „połączona”, robot nie jedzie, brak kamery | Program manager był OFF / bez heartbeatu — zaktualizuj RPilot i zrób **Reload** w Expo Go |
| Expo Go wymaga internetu | Otwórz ręcznie `exp://<IP_PC>:41782`; `./start.sh` ustawia `EXPO_OFFLINE=1` |
| Brak klatek kamery (Expo) | PC i Pi w tej samej Wi‑Fi; sink = IP PC (`EXPO_PUBLIC_VIDEO_SINK_HOST`); działa `./start.sh` |
| „Szukam robota…” w kółko | W Expo Go wpisz IP ręcznie (brak UDP discovery) |
| Konflikt połączenia | Zamknij panel Gremlina w przeglądarce — **1 klient** na `:8765` |
| Zły IP Pi | `export GREMLIN_HOST=<prawdziwe_IP>` i ponów `./start.sh` |
| Firewall | Otwórz porty z tabeli powyżej (PC: `41782`, `8766`, `8768`, `9000/udp`; Pi: `8765`, `3000`) |
| Gościnne Wi‑Fi | Klienci nie widzą się nawzajem — użyj normalnej sieci LAN |

---

## 10. Zmienne środowiskowe

| Zmienna | Domyślnie | Opis |
| --- | --- | --- |
| `GREMLIN_HOST` | `192.168.1.215` | IP Raspberry Pi |
| `EXPO_PORT` | `41782` | port Metro |
| `VIDEO_UDP_PORT` | `9000` | UDP klatek na PC |
| `VIDEO_WS_PORT` | `8766` | mostek WS kamery |
| `CONTROL_PROXY_PORT` | `8768` | proxy sterowania |
| `EXPO_OFFLINE` | `1` (w `start.sh`) | Metro bez phone-home do expo.dev |
| `EXPO_PUBLIC_VIDEO_SINK_HOST` | ustawiane przez `start.sh` | IP PC widziane przez Pi |
| `EXPO_PUBLIC_DEV_SERVER_HOST` | j.w. | IP PC dla Expo Go |
| `EXPO_PUBLIC_UI_ONLY` | — | tryb atrapy UI (`./start.sh --ui`) |
| `EXPO_PUBLIC_ROBOT_HOST` | — | sztywne IP robota przy starcie |

Przykład:

```bash
GREMLIN_HOST=192.168.1.50 ./start.sh
```

---

## Szybki start (ściąga)

```bash
# 1) Na Pi
python -m src.main

# 2) Na PC
cd mobile-rpi-robot-ctrl
npm install
export GREMLIN_HOST=192.168.1.215   # Twoje IP Pi
./start.sh

# 3) Na telefonie (Expo Go)
#    exp://<IP_PC>:41782
#    połącz z IP Pi → jedź
```

---

*Dokument wygenerowany dla repozytorium `mobile-rpi-robot-ctrl` (RPilot). Aktualne skrypty: `start.sh`, `build-apk.sh`, `build-ipa.sh`.*
