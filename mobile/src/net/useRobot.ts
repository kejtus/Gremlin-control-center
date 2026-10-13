import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { computeChannelValuesFromVector, motorPackets, parseRemoteDrive, powerToPwm, vectorFromChannels, type DrivePose } from '../mecanum';
import { parseLidarPoints, type LidarPoint } from '../lidar';
import {
  PROTOCOL,
  clampStick,
  decodeStatusFile,
  defaultPiInfo,
  getDevicePowerPacket,
  isDummyTarget,
  parseDevicePowerStatus,
  parseRobotAddress,
  parseSystemStatusLog,
  robotHostname,
  devicePowerStatusPacket,
  soundControlPath,
  wsCandidates,
  type AdsValues,
  type AudioFilterConfig,
  type ControllableDevice,
  type DevicePowerMap,
  type EndpointInfo,
  type MotorPairs,
  type NoiseProfileStatus,
  type RobotInfo,
  type RobotStatus,
} from '../protocol';
import { DEFAULT_MOTOR_PAIRS } from '../mecanum';
import { DEMO_COMPONENTS, DEMO_INFO, DEMO_STATUS } from '../demo';
import { loadLastRobot, saveLastRobot } from '../storage';
import { getDevServerHost } from './lanIp';
import { isExpoGo, isStandaloneNative, usesPcRelay } from './runtime';
import { openUdpControl, type UdpLink } from './udpControl';
import { discoverRobots, udpAvailable } from './udpDiscover';

export type Phase = 'booting' | 'searching' | 'connecting' | 'online' | 'offline';

/**
 * Podgląd UI bez Pi:
 * - `./start.sh --ui` ustawia EXPO_PUBLIC_UI_ONLY=1 (web + Expo Go)
 * - albo sama przeglądarka na PC (bez Expo Go)
 */
const BOOT_PREVIEW =
  process.env.EXPO_PUBLIC_UI_ONLY === '1' ||
  process.env.EXPO_PUBLIC_UI_ONLY === 'true' ||
  (Platform.OS === 'web' && !isExpoGo());
const BOOT_LIVE = !BOOT_PREVIEW;

function envHost(): RobotInfo {
  const raw = process.env.EXPO_PUBLIC_ROBOT_HOST;
  if (raw) {
    const parsed = parseRobotAddress(raw);
    const candidate = {
      ...defaultPiInfo(),
      id: 'env',
      host: parsed.host,
      httpPort: parsed.httpPort,
    };
    if (parsed.host && !isDummyTarget(candidate)) return candidate;
  }
  return defaultPiInfo();
}

function directPi(info: RobotInfo): RobotInfo {
  return {
    ...info,
    host: robotHostname(info.host) || info.host,
    wsPort: info.wsPort || PROTOCOL.wsPort,
    via: info.via === 'manual' || info.via === 'udp' ? info.via : 'ws',
  };
}

export function useRobot() {
  const [phase, setPhase] = useState<Phase>(BOOT_LIVE ? 'searching' : 'online');
  const [robots, setRobots] = useState<RobotInfo[]>([]);
  const [active, setActive] = useState<RobotInfo | null>(BOOT_LIVE ? null : DEMO_INFO);
  const [status, setStatus] = useState<RobotStatus | null>(BOOT_LIVE ? null : DEMO_STATUS);
  const [endpoints, setEndpoints] = useState<EndpointInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [transport, setTransport] = useState<'udp' | 'ws' | 'http'>('ws');
  const [power, setPower] = useState(0.45);
  const [componentStatus, setComponentStatus] = useState<Record<string, string>>(
    BOOT_LIVE ? {} : DEMO_COMPONENTS,
  );
  const [devicePower, setDevicePower] = useState<DevicePowerMap>({
    'OAK-D': true,
    LIDAR: true,
    MIC: true,
    SPEAKER: true,
  });
  const devicePowerRef = useRef(devicePower);
  devicePowerRef.current = devicePower;
  const [adsValues, setAdsValues] = useState<AdsValues | null>(
    BOOT_LIVE ? null : { a0: 12.4, a1: 0, a2: 0, a3: 0 },
  );
  const [noiseProfile, setNoiseProfile] = useState<NoiseProfileStatus | null>(
    BOOT_LIVE ? null : { is_calibrating: false, has_profile: true },
  );
  const [audioFilter, setAudioFilter] = useState<AudioFilterConfig | null>(
    BOOT_LIVE
      ? null
      : {
          lidar_enabled: true,
          motor_enabled: true,
          lidar_center_hz: 0,
          motor_center_hz: 0,
        },
  );
  const [encoderTicks, setEncoderTicks] = useState<Record<string, number> | null>(
    BOOT_LIVE ? null : { FL: 0, FR: 0, RL: 0, RR: 0 },
  );
  const [preview, setPreview] = useState(BOOT_PREVIEW);
  const [drivePose, setDrivePose] = useState<DrivePose>({ vx: 0, vy: 0, omega: 0 });
  const [lidarPoints, setLidarPoints] = useState<LidarPoint[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const udpRef = useRef<UdpLink | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scanRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeRef = useRef<RobotInfo | null>(BOOT_LIVE ? null : DEMO_INFO);
  const driveRef = useRef({ vy: 0, vx: 0, omega: 0, moving: false, power01: null as number | null });
  const driveTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastChannels = useRef('');
  const remoteChannels = useRef<Record<number, number>>({});
  const remoteMotorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pairsRef = useRef<MotorPairs>(DEFAULT_MOTOR_PAIRS);
  const powerRef = useRef(0.45);
  const busyRef = useRef(false);
  const linkGen = useRef(0);
  const previewRef = useRef(BOOT_PREVIEW);
  const bootTried = useRef(false);
  const ackWaiter = useRef<(() => void) | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wantLink = useRef(false);

  const stopScanLoop = () => {
    if (scanRef.current) {
      clearInterval(scanRef.current);
      scanRef.current = null;
    }
  };

  const teardownLink = useCallback(() => {
    linkGen.current += 1;
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (driveTimer.current) {
      clearInterval(driveTimer.current);
      driveTimer.current = null;
    }
    if (remoteMotorTimer.current) {
      clearTimeout(remoteMotorTimer.current);
      remoteMotorTimer.current = null;
    }
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
    ackWaiter.current = null;
    try {
      wsRef.current?.close();
    } catch {
      /* ignore */
    }
    wsRef.current = null;
    udpRef.current?.close();
    udpRef.current = null;
  }, []);

  const applyStatus = useCallback((next: RobotStatus) => {
    setStatus(next);
  }, []);

  const sendJson = useCallback((packet: object) => {
    udpRef.current?.send(packet);
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(packet));
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }, []);

  /** Tylko WebSocket do Pi/proxy — bez UDP (np. device_power_status). */
  const sendWsJson = useCallback((packet: object) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(packet));
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }, []);

  /** Wysyła 1+ pakietów na Pi (pad / dźwięki). false = brak otwartego WS. */
  const sendPackets = useCallback(
    (packets: object[]) => {
      if (!packets.length) return false;
      let ok = false;
      for (const pkt of packets) {
        if (sendJson(pkt)) ok = true;
      }
      return ok;
    },
    [sendJson],
  );

  const sendMotors = useCallback(
    (vy: number, vx: number, omega: number, heartbeat = false, power01?: number) => {
      const pwm = powerToPwm(power01 ?? powerRef.current);
      const channels = computeChannelValuesFromVector(vy, vx, omega, pwm, pairsRef.current);
      const serialized = JSON.stringify(channels);
      if (!heartbeat && serialized === lastChannels.current) return;
      lastChannels.current = serialized;
      for (const pkt of motorPackets(channels)) sendJson(pkt);
    },
    [sendJson],
  );

  /** Surowy PWM (tańce / gotowe ruchy) — wyłącza pętlę joysticka. */
  const sendChannels = useCallback(
    (channels: Record<number, number>) => {
      driveRef.current = { vy: 0, vx: 0, omega: 0, moving: false, power01: null };
      const serialized = JSON.stringify(channels);
      lastChannels.current = serialized;
      for (const pkt of motorPackets(channels)) sendJson(pkt);
    },
    [sendJson],
  );

  const openSocket = useCallback(
    (info: RobotInfo) => {
      // Expo Go: najpierw proxy na PC, potem bezpośrednie Pi (gdy proxy/PC nie działa).
      // APK: od razu Pi.
      const candidates: string[] = [];
      if (usesPcRelay()) {
        const pc = getDevServerHost();
        if (pc) candidates.push(`ws://${pc}:${PROTOCOL.controlProxyPort}`);
      }
      for (const url of wsCandidates(info)) {
        if (!candidates.includes(url)) candidates.push(url);
      }
      const attach = (ws: WebSocket) => {
        ws.onmessage = (ev) => {
          try {
            const parsed = JSON.parse(String(ev.data)) as Record<string, unknown>;
            const type = typeof parsed.type === 'string' ? parsed.type : '';
            if (
              type === 'program_status' ||
              type === 'get_program_status' ||
              type === 'ads1115_values' ||
              type === 'status' ||
              (parsed.status && typeof parsed.status === 'object')
            ) {
              ackWaiter.current?.();
              ackWaiter.current = null;
            }
            if (type === 'status' && typeof parsed.file === 'string') {
              setComponentStatus(parseSystemStatusLog(decodeStatusFile(parsed.file)));
            } else if (parsed.status && typeof parsed.status === 'object' && parsed.status !== null && !Array.isArray(parsed.status)) {
              const st = parsed.status as RobotStatus;
              applyStatus(st);
              if (st.channels) setDrivePose(vectorFromChannels(st.channels, pairsRef.current));
            }
            if (type === 'ads1115_values' && parsed.values && typeof parsed.values === 'object') {
              const values = parsed.values as AdsValues;
              if (values.a0 != null) {
                const v = values.a0;
                const pct = Math.max(0, Math.min(100, ((v - 10) / 6) * 100));
                setAdsValues(values);
                setStatus((prev) => (prev ? { ...prev, batteryPct: pct } : prev));
              }
            }
            if (type === 'program_status' || type === 'get_program_status') {
              setStatus((prev) =>
                prev ? { ...prev, programOn: parsed.status === 'on' } : prev,
              );
            }
            if (type === 'encoder_ticks' && parsed.ticks && typeof parsed.ticks === 'object') {
              setEncoderTicks(parsed.ticks as Record<string, number>);
            }
            if (type === 'noise_profile_status') {
              setNoiseProfile({
                is_calibrating: Boolean(parsed.is_calibrating),
                has_profile: Boolean(parsed.has_profile),
              });
            }
            if (type === 'audio_filter_config') {
              setAudioFilter({
                lidar_enabled: Boolean(parsed.lidar_enabled),
                motor_enabled: Boolean(parsed.motor_enabled),
                lidar_center_hz: Number(parsed.lidar_center_hz) || 0,
                motor_center_hz: Number(parsed.motor_center_hz) || 0,
              });
            }
            if (type === 'lidar_points') {
              setLidarPoints(parseLidarPoints(parsed.points));
            }
            const power = parseDevicePowerStatus(parsed as Record<string, unknown>);
            if (power) {
              setDevicePower((prev) => {
                const next = { ...prev, ...power };
                devicePowerRef.current = next;
                return next;
              });
            }
            const remote = parseRemoteDrive(parsed);
            if (remote) setDrivePose(remote);
            if (type === 'motor' && parsed.channel != null && parsed.pwm != null) {
              const ch = Number(parsed.channel);
              const pwm = Number(parsed.pwm);
              if (Number.isFinite(ch) && Number.isFinite(pwm)) {
                remoteChannels.current[ch] = pwm;
                if (remoteMotorTimer.current) clearTimeout(remoteMotorTimer.current);
                remoteMotorTimer.current = setTimeout(() => {
                  remoteMotorTimer.current = null;
                  setDrivePose(vectorFromChannels(remoteChannels.current, pairsRef.current));
                }, 20);
              }
            }
          } catch {
            /* ignore */
          }
        };
      };

      return new Promise<boolean>((resolve) => {
        let settled = false;
        const finish = (ok: boolean) => {
          if (settled) return;
          settled = true;
          resolve(ok);
        };

        if (!candidates.length) {
          finish(false);
          return;
        }

        const tryNext = (i: number) => {
          if (settled) return;
          if (i >= candidates.length) {
            finish(false);
            return;
          }
          let ws: WebSocket;
          try {
            ws = new WebSocket(candidates[i]);
          } catch {
            tryNext(i + 1);
            return;
          }
          wsRef.current = ws;
          attach(ws);
          let movedOn = false;
          const goNext = () => {
            if (settled || movedOn) return;
            movedOn = true;
            try {
              ws.close();
            } catch {
              /* ignore */
            }
            tryNext(i + 1);
          };
          const timer = setTimeout(() => {
            if (ws.readyState !== WebSocket.OPEN) {
              if (wsRef.current === ws) goNext();
            }
          }, 5000);
          const gen = linkGen.current;
          ws.onopen = () => {
            clearTimeout(timer);
            setTransport('ws');
            sendJson({ type: 'get_program_status' });
            sendJson({ type: 'get_ads1115_values' });
            finish(true);
          };
          ws.onerror = () => {
            clearTimeout(timer);
            if (wsRef.current === ws && ws.readyState !== WebSocket.OPEN) goNext();
          };
          ws.onclose = () => {
            clearTimeout(timer);
            if (wsRef.current === ws) wsRef.current = null;
            if (!settled) {
              goNext();
              return;
            }
            if (gen === linkGen.current && wantLink.current && activeRef.current && !previewRef.current) {
              setPhase('offline');
              setError(
                isStandaloneNative()
                  ? 'Utracono WS (:8765) — ktoś inny zajął slot (Expo/proxy/panel). Zamykam inne klienty i łączę ponownie…'
                  : 'Utracono połączenie z robotem. Ponawiam…',
              );
              if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
              reconnectTimer.current = setTimeout(() => {
                const target = activeRef.current;
                if (target && wantLink.current && !busyRef.current) {
                  void connectRef.current?.(target);
                }
              }, 1500);
            }
          };
        };
        tryNext(0);
      });
    },
    [applyStatus, sendJson],
  );

  const connectRef = useRef<((info: RobotInfo) => Promise<boolean>) | null>(null);

  const waitRobotAck = useCallback((ms: number) => {
    return new Promise<boolean>((resolve) => {
      let done = false;
      const finish = (ok: boolean) => {
        if (done) return;
        done = true;
        ackWaiter.current = null;
        clearTimeout(timer);
        resolve(ok);
      };
      const timer = setTimeout(() => finish(false), ms);
      ackWaiter.current = () => finish(true);
    });
  }, []);

  const connect = useCallback(
    async (info: RobotInfo) => {
      if (busyRef.current) return false;
      previewRef.current = false;
      setPreview(false);
      wantLink.current = true;
      busyRef.current = true;
      setPhase('connecting');
      setError(null);
      teardownLink();
      try {
        const probed = directPi(info);
        pairsRef.current = DEFAULT_MOTOR_PAIRS;
        activeRef.current = probed;
        setActive(probed);
        await saveLastRobot(probed);

        const udp = probed.via !== 'same-origin' && udpAvailable() ? openUdpControl(probed, applyStatus) : null;
        udpRef.current = udp;
        setTransport(udp ? 'udp' : 'ws');
        // Waiter PRZED open — odpowiedź z Pi często wraca zanim openSocket zwróci true.
        const ackPromise = waitRobotAck(4000);
        const wsOk = await openSocket(probed);
        const host = robotHostname(probed.host);

        if (!wsOk && !udp) {
          ackWaiter.current = null;
          const pc = usesPcRelay() ? getDevServerHost() : null;
          setPhase('offline');
          setError(
            pc
              ? `Brak WS: ani proxy ws://${pc}:${PROTOCOL.controlProxyPort}, ani Pi ws://${host}:${probed.wsPort || PROTOCOL.wsPort}. Odpal ./start.sh na PC albo sprawdź IP Pi.`
              : `Brak WS: ws://${host}:${probed.wsPort || PROTOCOL.wsPort}. Zamknij panel Gremlina / Expo Go (1 klient na :8765).`,
          );
          return false;
        }

        // Drugi ping na wypadek gdy pierwsza odpowiedź poszła w pustkę.
        sendJson({ type: 'get_program_status' });
        sendJson({ type: 'get_ads1115_values' });
        const ack = await ackPromise;
        if (!ack) {
          setPhase('offline');
          setError(
            usesPcRelay()
              ? `PC/proxy odpowiada, ale Pi (${host}:8765) milczy. Sprawdź python -m src.main na malinie.`
              : `APK nie utrzymał WS do ${host}:8765. Zamknij Expo Go i upewnij się, że ./start.sh nie trzyma Pi (proxy tylko dla Expo).`,
          );
          teardownLink();
          return false;
        }

        setStatus({
          id: probed.id,
          name: probed.name,
          connected: true,
          uptimeSec: 0,
          batteryPct: 0,
          motors: { left: 0, right: 0 },
          pose: { x: 5, y: 5, heading: 0 },
          lights: false,
          estop: false,
          lastCommandAgeMs: null,
          clients: 1,
          mode: 'gremlin',
          arena: { width: 10, height: 10 },
        });
        setEndpoints([
          { method: 'WS', path: `ws://${host}:${probed.wsPort || PROTOCOL.wsPort}`, summary: 'Sterowanie na Pi' },
          { method: 'UDP', path: `:${PROTOCOL.videoUdpPort}`, summary: 'Kamera JPEG z Pi' },
        ]);

        pollRef.current = setInterval(() => {
          sendJson({ type: 'get_ads1115_values' });
        }, 2000);

        setPhase('online');
        setRobots((prev) => [probed, ...prev.filter((r) => r.id !== probed.id)]);
        return true;
      } catch {
        setPhase('offline');
        setError('Nie udało się połączyć z Gremlinem (WS :8765).');
        return false;
      } finally {
        busyRef.current = false;
      }
    },
    [applyStatus, openSocket, sendJson, teardownLink, waitRobotAck],
  );
  connectRef.current = connect;

  const scanOnce = useCallback(async () => {
    const last = await loadLastRobot();
    const pi = envHost();
    let udpFound: RobotInfo[] = [];
    try {
      udpFound = (await discoverRobots(PROTOCOL.discoverTimeoutMs)).filter((r) => !isDummyTarget(r));
    } catch {
      udpFound = [];
    }
    const merged = new Map<string, RobotInfo>();
    merged.set(pi.id, pi);
    if (last && !isDummyTarget(last)) merged.set(last.id, directPi(last));
    for (const r of udpFound) merged.set(r.id, r);
    const list = [...merged.values()];
    setRobots(list);
    return { list, udpFound, pi };
  }, []);

  const enterUiPreview = useCallback(() => {
    wantLink.current = false;
    previewRef.current = true;
    teardownLink();
    stopScanLoop();
    activeRef.current = DEMO_INFO;
    setActive(DEMO_INFO);
    setStatus(DEMO_STATUS);
    setComponentStatus(DEMO_COMPONENTS);
    setAdsValues({ a0: 12.4, a1: 0, a2: 0, a3: 0 });
    setNoiseProfile({ is_calibrating: false, has_profile: true });
    setAudioFilter({
      lidar_enabled: true,
      motor_enabled: true,
      lidar_center_hz: 0,
      motor_center_hz: 0,
    });
    setEncoderTicks({ FL: 0, FR: 0, RL: 0, RR: 0 });
    setDrivePose({ vx: 0, vy: 0, omega: 0 });
    setError(null);
    setTransport('ws');
    setPhase('online');
    setPreview(true);
  }, [teardownLink]);

  const autoConnect = useCallback(async () => {
    previewRef.current = false;
    setPreview(false);
    wantLink.current = true;
    setPhase('searching');
    setError(null);

    const last = await loadLastRobot();
    const pi = envHost();
    const { udpFound } = await scanOnce();

    const ordered: RobotInfo[] = [];
    const seen = new Set<string>();
    const push = (r: RobotInfo | null | undefined) => {
      if (!r || isDummyTarget(r)) return;
      const key = robotHostname(r.host);
      if (!key || seen.has(key)) return;
      seen.add(key);
      ordered.push(directPi(r));
    };
    push(last);
    push(pi);
    for (const r of udpFound) push(r);

    for (let attempt = 0; attempt < 2; attempt++) {
      for (const target of ordered) {
        if (await connect(target)) return;
      }
      if (attempt === 0) {
        setError('Ponawiam łączenie z Pi…');
        await new Promise((r) => setTimeout(r, 1200));
      }
    }

    setPhase('offline');
    setError(
      `Nie połączono z Gremlinem (próbowano: ${ordered.map((r) => r.host).join(', ') || pi.host}). Wpisz IP ręcznie. Na Pi: python -m src.main. W Expo Go: ./start.sh na PC.`,
    );
  }, [connect, scanOnce]);

  useEffect(() => {
    if (!BOOT_LIVE || bootTried.current) return;
    bootTried.current = true;
    void autoConnect();
  }, [autoConnect]);

  useEffect(() => {
    return () => {
      stopScanLoop();
      teardownLink();
    };
  }, [teardownLink]);

  const startDriveLoop = useCallback(() => {
    if (driveTimer.current) return;
    driveTimer.current = setInterval(() => {
      const { vy, vx, omega, moving, power01 } = driveRef.current;
      if (!moving) return;
      sendMotors(vy, vx, omega, true, power01 ?? undefined);
    }, Math.round(1000 / PROTOCOL.driveHz));
  }, [sendMotors]);

  const drive = useCallback(
    (x: number, y: number, omega?: number, power01?: number) => {
      const vx = clampStick(x);
      const vy = clampStick(y);
      const w = omega === undefined ? driveRef.current.omega : clampStick(omega);
      const moving = Math.hypot(vx, vy, w) > 0.04;
      const p =
        power01 === undefined ? null : Math.max(0, Math.min(1, power01));
      driveRef.current = { vy, vx, omega: w, moving, power01: p };
      if (moving) {
        sendMotors(vy, vx, w, false, p ?? undefined);
        startDriveLoop();
      } else sendMotors(0, 0, 0);
    },
    [sendMotors, startDriveLoop],
  );

  const setOmega = useCallback(
    (omega: number) => {
      const { vx, vy, power01 } = driveRef.current;
      drive(vx, vy, omega, power01 ?? undefined);
    },
    [drive],
  );

  const stop = useCallback(() => {
    driveRef.current = { vy: 0, vx: 0, omega: 0, moving: false, power01: null };
    sendMotors(0, 0, 0);
    sendJson({ type: 'stop' });
  }, [sendJson, sendMotors]);

  const command = useCallback(
    async (name: string) => {
      if (name === 'beep' || name === 'signal') sendJson({ type: 'play_sound', file: 'beep.wav', volume: 1 });
      else if (name === 'lights') sendJson({ type: 'gpio', pin_name: 'GPIO4', value: 1 });
      else if (name === 'center' || name === 'stop') stop();
      else if (name === 'follow') sendJson({ type: 'set_follow_band_mode', enabled: true });
      else if (name === 'manual') sendJson({ type: 'set_follow_band_mode', enabled: false });
      else sendJson({ type: name });
    },
    [sendJson, stop],
  );

  const connectManual = useCallback(
    async (host: string) => {
      const trimmed = host.trim();
      if (!trimmed) return false;
      const parsed = parseRobotAddress(trimmed);
      const info: RobotInfo = {
        id: `manual-${parsed.host}`,
        name: 'Gremlin',
        host: parsed.host,
        httpPort: parsed.httpPort,
        wsPort: PROTOCOL.wsPort,
        sitePort: parsed.httpPort === PROTOCOL.httpPort ? PROTOCOL.sitePort : parsed.httpPort,
        udpPort: PROTOCOL.discoverPort,
        proto: PROTOCOL.proto,
        via: 'manual',
      };
      previewRef.current = false;
      setPreview(false);
      wantLink.current = true;
      return connect(info);
    },
    [connect],
  );

  const disconnect = useCallback(() => {
    wantLink.current = false;
    stop();
    teardownLink();
    previewRef.current = false;
    setPreview(false);
    activeRef.current = null;
    setActive(null);
    setStatus(null);
    setLidarPoints([]);
    setPhase('offline');
  }, [stop, teardownLink]);

  const updatePower = useCallback((p: number) => {
    const v = clampStick(p) < 0 ? 0 : Math.min(1, p);
    powerRef.current = v;
    setPower(v);
    sendJson({ type: 'set_follow_band_speed', pwm: powerToPwm(v) });
  }, [sendJson]);

  const playSound = useCallback(
    (file: string, volume = 1) => {
      sendJson({ type: 'play_sound', file, volume: Math.max(0, Math.min(1, volume)) });
    },
    [sendJson],
  );

  const playUploadedSound = useCallback(
    (name: string, audioBase64: string, volume = 1) => {
      const file = soundControlPath(name.replace(/^\/+/, '') || 'upload.mp3');
      sendJson({
        type: 'play_sound',
        file,
        volume: Math.max(0, Math.min(1, volume)),
        audio_b64: audioBase64,
      });
    },
    [sendJson],
  );

  const stopSound = useCallback(() => {
    sendJson({ type: 'stop_sound' });
  }, [sendJson]);

  const setStream = useCallback(
    (enabled: boolean) => {
      sendJson({ type: 'stream', enabled });
    },
    [sendJson],
  );

  const registerVideoSink = useCallback(
    (udpPort = PROTOCOL.videoUdpPort, sinkHost?: string | null) => {
      sendJson({
        type: 'register_video_sink',
        host: sinkHost || '0.0.0.0',
        port: udpPort,
      });
    },
    [sendJson],
  );

  const requestSystemStatus = useCallback(() => {
    sendJson({ send: 'status' });
    sendJson({ type: 'get_ads1115_values' });
    sendJson({ type: 'get_encoder_ticks' });
    sendJson({ type: 'get_noise_profile_status' });
    sendJson({ type: 'get_audio_filter_config' });
    sendJson({ type: 'get_program_status' });
    sendJson(getDevicePowerPacket());
  }, [sendJson]);

  const setDevicePowerEnabled = useCallback(
    (device: ControllableDevice, enabled: boolean): boolean => {
      const nextMap: DevicePowerMap = {
        ...devicePowerRef.current,
        [device]: enabled,
      };
      const ok = sendWsJson(devicePowerStatusPacket(nextMap));
      if (device === 'OAK-D') {
        sendWsJson({ type: 'stream', enabled });
      }
      if (ok) {
        setDevicePower(nextMap);
        devicePowerRef.current = nextMap;
      }
      return ok;
    },
    [sendWsJson],
  );

  const requestLidarPoints = useCallback(() => {
    sendJson({ type: 'get_lidar_points' });
  }, [sendJson]);

  return {
    phase,
    robots,
    active,
    status,
    endpoints,
    error,
    transport,
    power,
    componentStatus,
    devicePower,
    adsValues,
    noiseProfile,
    audioFilter,
    encoderTicks,
    preview,
    drivePose,
    lidarPoints,
    setPower: updatePower,
    udpAvailable: udpAvailable(),
    drive,
    setOmega,
    stop,
    command,
    connect,
    connectManual,
    disconnect,
    retry: autoConnect,
    enterUiPreview,
    sendJson,
    sendPackets,
    sendChannels,
    playSound,
    playUploadedSound,
    stopSound,
    setStream,
    registerVideoSink,
    requestSystemStatus,
    setDevicePowerEnabled,
    requestLidarPoints,
  };
}
