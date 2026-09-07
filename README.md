# RPilot / Gremlin

Aplikacja mobilna do robota [Gremlin](https://github.com/frykol/gremlin/tree/websocket-rewrite).

Na Pi Gremlin już hostuje panel (`site/`, port **3000**) i kanał sterowania **WebSocket :8765**. Ta aplikacja przy starcie szuka robota broadcastem UDP, łączy się z tym kanałem i wysyła te same pakiety silników co zakładka Control:

```json
{ "type": "motor", "channel": 0, "pwm": 1500 }
```

Mecanum: góra/dół = jazda, lewo/prawo = ślizg, przyciski = obrót. Mapowanie kół bierze z `GET /api/robot-config` (`motors` w `config.json`).

## Na Raspberry Pi (prawdziwy Gremlin)

1. Odpal Gremlina jak zwykle (`python -m src.main` / panel na `:3000`, WS na `:8765`).
2. Obok, żeby telefon znalazł Pi sam:

```bash
python rpi/gremlin_discover.py
```

Sidecar tylko odpowiada na `GREMLIN_DISCOVER` (UDP **45454**) adresem i portami. Sterowanie idzie prosto do Gremlina na `:8765` — nie zajmuje połączenia WS.

## Aplikacja mobilna

```bash
cd mobile
npm install
npx expo start
```

APK: `cd mobile && npx eas build -p android --profile preview`

Przy starcie: ostatni adres → broadcast UDP → `ws://<ip>:8765`.

W przeglądarce nie ma UDP; wtedy używany jest HTTP/WS (ten sam panel co w podglądzie).

Przycisk **Panel Gremlin** otwiera `http://<ip>:3000` — pełny interfejs z kamery, lidaru, GPIO, configu.

## Podgląd / symulator (bez Pi)

```bash
pip install -r rpi/requirements.txt
python rpi/rpilot_agent.py --host 0.0.0.0 --port 8742
```

Symulator mówi protokołem Gremlina (WS `:8765` + `/ws` na HTTP, discovery UDP, ` /api/robot-config`).

## Protokół (jak w Gremlinie)

| Kanał | Adres | Rola |
| --- | --- | --- |
| UDP discover | `:45454` | `GREMLIN_DISCOVER` → `GREMLIN_HERE` + IP |
| WebSocket | `:8765` | `motor`, `gpio`, `play_sound`, `get_ads1115_values`, `get_encoder_ticks`, `register_video_sink`, `set_program_status`, … |
| HTTP panel | `:3000` | `/api/robot-config`, `/api/config`, `/api/sounds`, UI |
| UDP kamera | `:9000` | klatki JPEG (site przekazuje do przeglądarki) |

PWM: 0–4095, 8 kanałów. Cisza 350 ms = stop (w aplikacji i w symulatorze).

## Testy

```bash
cd rpi && python -m pytest test_agent.py
```
