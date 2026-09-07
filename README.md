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

## Aplikacja na telefonie (Expo Go)

Szczegółowo: poniżej. Krótko:

```bash
cd mobile
npm install
npx expo start
```

W Expo Go **nie ma UDP** (natywny `react-native-udp` nie wchodzi w Go). Aplikacja i tak wstaje: wpisz IP ręcznie, sterowanie idzie WebSocketem `:8765`. Broadcast discovery działa dopiero w APK / development build (`eas build`).

APK: `cd mobile && npx eas build -p android --profile preview`

### Krok po kroku — Expo Go

**1. Telefon i komputer w tej samej sieci Wi‑Fi.**  
Telefon musi dosięgnąć Pi (albo komputera z symulatorem) po LAN. VPN / „gościnne Wi‑Fi” z izolacją klientów często blokuje WS.

**2. Zainstaluj Expo Go**  
- Android: [Expo Go w Google Play](https://play.google.com/store/apps/details?id=host.exp.exponent)  
- iPhone: [Expo Go w App Store](https://apps.apple.com/app/expo-go/id982107779)

**3. Pobierz repo i zależności (na komputerze)**

```bash
# Origin CLI — jeśli jeszcze nie masz
curl -fsSL https://downloads.cursor.com/origin/install.sh | sh
origin auth login
origin repo clone katarzyna-tylutka/mobile-rpi-robot-ctrl
cd mobile-rpi-robot-ctrl
```

Jeśli `origin` nie jest w PATH:

```bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

Node 20+ i npm:

```bash
cd mobile
npm install
```

**4. Odpal robota albo symulator (zanim otworzysz aplikację)**

*Prawdziwy Gremlin na Pi* (osobny terminal, na malinie):

```bash
# katalog Gremlina, gałąź websocket-rewrite
python -m src.main
```

W drugim terminalu, z tego repo (też na Pi albo w sieci z Pi):

```bash
python rpi/gremlin_discover.py
```

*Albo bez Pi — symulator na komputerze* (osobny terminal, z korzenia repo):

```bash
pip install -r rpi/requirements.txt
python rpi/rpilot_agent.py --host 0.0.0.0 --port 8742
```

Zostaw ten proces włączony. Sprawdź IP komputera / Pi w LAN, np. `ip addr` / `ipconfig` (np. `192.168.1.42`).

**5. Start Metro (komputer, katalog `mobile/`)**

```bash
npx expo start
```

Pojawi się QR. Zostaw ten terminal otwarty.

- **Android:** w Expo Go → Scan QR code.  
- **iPhone:** aparat na QR (otworzy Expo Go).  
Jeśli QR nie łapie: w terminalu wciśnij `s` (switch to Expo Go) albo `t` (tunnel), potem zeskanuj ponownie.

Komputer i telefon muszą się widzieć (ten sam Wi‑Fi). Na tunelu ładuje się tylko JS — **do robota i tak musi być LAN**.

**6. Gdy aplikacja wstanie**

Ekran „Szukam robota…” w Expo Go zwykle **nie znajdzie Pi sam** (brak broadcastu UDP). To normalne.

1. W polu **Adres ręczny** wpisz IP:
   - symulator: `192.168.x.x:8742`
   - prawdziwy Gremlin (panel): `192.168.x.x:3000` albo samo `192.168.x.x`
2. **OK**.
3. Powinien pojawić się drążek, status „Gremlin”, bateria.

Opcjonalnie, żeby nie wpisywać IP za każdym razem, start z hostem:

```bash
EXPO_PUBLIC_ROBOT_HOST=192.168.1.42:8742 npx expo start
```

(dla Pi z panelem: `192.168.1.42:3000`)

**7. Co sprawdzić, że działa**

| Krok | Oczekiwany efekt |
| --- | --- |
| Połączenie | Zielona kropka, nazwa Gremlin, nie „brak połączenia” |
| Drążek do góry ~1 s | Na symulatorze ruszają FL/FR/RL/RR; na Pi koła (uważaj na stół) |
| Puszczenie / **STOP** | PWM wraca do 0, robot stoi |
| Obrót L / P | Obrót w miejscu |
| Moc 25–100% | Słabszy / mocniejszy PWM |
| **Panel Gremlin** | Otwiera `http://<ip>:3000` (prawdziwy interfejs na Pi) |

Gremlin ma **jedno** połączenie WS: jeśli otwarty jest panel w przeglądarce, telefon go zastąpi (i odwrotnie).

**8. Typowe problemy**

- Ciągle „szukam” → wpisz IP ręcznie (Expo Go).  
- „Robot nie odpowiada na HTTP” → firewall na PC (porty **8742** i **8765**); na Pi **3000** i **8765**; `--host 0.0.0.0`.  
- Expo Go: „Something went wrong” przy starcie → ten sam Wi‑Fi, `npx expo start --tunnel`, SDK 57 w Go.  
- Koła nie jadą, UI łączy się → na Pi musi działać `src.main` (WS `:8765`). Sam sidecar discovery nie steruje silnikami.  
- iPhone pyta o sieć lokalną → zezwól (Sterowanie → Expo Go).

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
