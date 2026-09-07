# RPilot

Aplikacja mobilna i agent na Raspberry Pi do sterowania robotem w sieci lokalnej.

Przy starcie telefon wysyła **broadcast UDP**. Pi odpowiada swoim adresem. Aplikacja łączy się sama i jedzie po **UDP** (drążek). Ten sam agent hostuje gotowy panel WWW i REST.

## Architektura

```
telefon (RPilot)  --UDP broadcast :45454-->  Raspberry Pi
                  <--RPILOT_HERE + IP------
                  --UDP JSON :45455------->  napęd (GPIO albo symulacja)
                  --HTTP :8742------------>  status, komendy, panel
```

- `mobile/` — aplikacja Expo (Android / iOS / web). Na telefonie discovery i sterowanie idą UDP.
- `rpi/` — agent Pythona: discovery, UDP, WebSocket, REST, PWA instalowalna z przeglądarki.

Protokół sterowania jest jeden: `{ "t": "drive", "x": 0.2, "y": 0.8, "seq": 12 }`. `x` to skręt, `y` to jazda. Brak pakietów przez 350 ms zatrzymuje silniki.

## Raspberry Pi

Na Pi (albo na komputerze deweloperskim):

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r rpi/requirements.txt
python rpi/rpilot_agent.py --host 0.0.0.0 --port 8742
```

Panel: `http://<ip-maliny>:8742`  
Na telefonie: **Zainstaluj aplikację** / Dodaj do ekranu głównego (PWA) albo zbuduj APK z katalogu `mobile`.

Autostart (systemd): skopiuj `rpi/rpilot.service` do `/etc/systemd/system/`, popraw ścieżki, potem `systemctl enable --now rpilot`.

### GPIO

Bez `gpiozero` agent pracuje w **symulacji** (widać pozę na arenie). Na Pi z mostkiem L298N:

```
RPILOT_LEFT_FWD=17
RPILOT_LEFT_REV=18
RPILOT_RIGHT_FWD=22
RPILOT_RIGHT_REV=23
```

Inne zmienne: `RPILOT_NAME`, `RPILOT_HTTP_PORT`, `RPILOT_DISCOVER_PORT`, `RPILOT_CONTROL_PORT`.

## Aplikacja mobilna

```bash
cd mobile
npm install
npx expo start
```

APK do wgrania na telefon (wymaga konta Expo):

```bash
cd mobile
npx eas-cli login
npx eas build -p android --profile preview
```

Po instalacji aplikacja przy włączeniu:

1. odpytuje ostatnio zapisany adres,
2. wysyła broadcast `RPILOT_DISCOVER`,
3. łączy się z pierwszą odpowiedzią i otwiera drążek.

W przeglądarce nie ma UDP — wtedy używany jest HTTP/WebSocket (ten sam panel co na Pi).

Opcjonalnie: `EXPO_PUBLIC_ROBOT_HOST=192.168.1.42:8742`.

## Endpointy agenta

| Metoda | Ścieżka | Opis |
| --- | --- | --- |
| GET | `/api/info` | id, nazwa, porty |
| GET | `/api/status` | poza, PWM, bateria |
| GET | `/api/health` | liveness |
| GET | `/api/endpoints` | lista API |
| GET | `/api/motors` | lewy/prawy |
| POST | `/api/drive` | `{ "x", "y" }` −1…1 |
| POST | `/api/stop` | stop |
| POST | `/api/command/{name}` | `beep`, `lights`, `dock`, `center`, `estop` |
| WS | `/ws/control` | ten sam JSON co UDP |
| UDP | `:45454` | discovery |
| UDP | `:45455` | drive / stop / cmd |

## Testy agenta

```bash
pip install -r rpi/requirements.txt pytest
cd rpi && python -m pytest test_agent.py
```
