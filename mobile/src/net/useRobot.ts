import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { computeChannelValuesFromVector, motorPackets, powerToPwm } from '../mecanum';
import {
  PROTOCOL,
  clampStick,
  wsUrl,
  type EndpointInfo,
  type MotorPairs,
  type RobotInfo,
  type RobotStatus,
} from '../protocol';
import { DEFAULT_MOTOR_PAIRS } from '../mecanum';
import { loadLastRobot, saveLastRobot } from '../storage';
import {
  fetchEndpoints,
  fetchMotorPairs,
  fetchStatus,
  probeRobot,
  sameOriginInfo,
} from './http';
import { openUdpControl, type UdpLink } from './udpControl';
import { discoverRobots, udpAvailable } from './udpDiscover';

export type Phase = 'booting' | 'searching' | 'connecting' | 'online' | 'offline';

function envHost(): RobotInfo | null {
  const raw = process.env.EXPO_PUBLIC_ROBOT_HOST;
  if (!raw) return null;
  const host = raw.replace(/\/$/, '');
  try {
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      const url = new URL(raw);
      return {
        id: 'env',
        name: 'Gremlin',
        host,
        httpPort: url.port ? Number(url.port) : 80,
        wsPort: PROTOCOL.wsPort,
        sitePort: PROTOCOL.sitePort,
        udpPort: PROTOCOL.discoverPort,
        proto: PROTOCOL.proto,
        via: 'http',
      };
    }
  } catch {
    return null;
  }
  const [h, p] = raw.split(':');
  return {
    id: 'env',
    name: 'Gremlin',
    host: h,
    httpPort: p ? Number(p) : PROTOCOL.httpPort,
    wsPort: PROTOCOL.wsPort,
    sitePort: PROTOCOL.sitePort,
    udpPort: PROTOCOL.discoverPort,
    proto: PROTOCOL.proto,
    via: 'http',
  };
}

function webHttpCandidates(): RobotInfo[] {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return [];
  const { hostname, protocol, port } = window.location;
  const items: RobotInfo[] = [sameOriginInfo()];
  if (hostname) {
    items.push({
      id: 'lan-site',
      name: 'Gremlin',
      host: hostname,
      httpPort: PROTOCOL.sitePort,
      wsPort: PROTOCOL.wsPort,
      sitePort: PROTOCOL.sitePort,
      udpPort: PROTOCOL.discoverPort,
      proto: PROTOCOL.proto,
      via: 'http',
    });
    const currentPort = port ? Number(port) : protocol === 'https:' ? 443 : 80;
    if (currentPort !== PROTOCOL.httpPort) {
      items.push({
        id: 'sim-http',
        name: 'Gremlin',
        host: hostname,
        httpPort: PROTOCOL.httpPort,
        wsPort: PROTOCOL.wsPort,
        sitePort: PROTOCOL.sitePort,
        udpPort: PROTOCOL.discoverPort,
        proto: PROTOCOL.proto,
        via: 'http',
      });
    }
  }
  return items;
}

async function probeMany(candidates: RobotInfo[]): Promise<RobotInfo | null> {
  const unique = new Map<string, RobotInfo>();
  for (const c of candidates) unique.set(`${c.host}:${c.httpPort}`, c);
  const results = await Promise.all([...unique.values()].map((c) => probeRobot(c)));
  return results.find((r): r is RobotInfo => r != null) ?? null;
}

export function useRobot() {
  const [phase, setPhase] = useState<Phase>('booting');
  const [robots, setRobots] = useState<RobotInfo[]>([]);
  const [active, setActive] = useState<RobotInfo | null>(null);
  const [status, setStatus] = useState<RobotStatus | null>(null);
  const [endpoints, setEndpoints] = useState<EndpointInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [transport, setTransport] = useState<'udp' | 'ws' | 'http'>('ws');
  const [power, setPower] = useState(0.45);

  const wsRef = useRef<WebSocket | null>(null);
  const udpRef = useRef<UdpLink | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scanRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeRef = useRef<RobotInfo | null>(null);
  const driveRef = useRef({ vy: 0, vx: 0, omega: 0, moving: false });
  const driveTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastChannels = useRef('');
  const pairsRef = useRef<MotorPairs>(DEFAULT_MOTOR_PAIRS);
  const powerRef = useRef(0.45);
  const busyRef = useRef(false);

  const stopScanLoop = () => {
    if (scanRef.current) {
      clearInterval(scanRef.current);
      scanRef.current = null;
    }
  };

  const teardownLink = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (driveTimer.current) {
      clearInterval(driveTimer.current);
      driveTimer.current = null;
    }
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
      ws.send(JSON.stringify(packet));
    }
  }, []);

  const sendMotors = useCallback(
    (vy: number, vx: number, omega: number) => {
      const channels = computeChannelValuesFromVector(vy, vx, omega, powerToPwm(powerRef.current), pairsRef.current);
      const serialized = JSON.stringify(channels);
      if (serialized === lastChannels.current && !vy && !vx && !omega) return;
      lastChannels.current = serialized;
      for (const pkt of motorPackets(channels)) sendJson(pkt);
    },
    [sendJson],
  );

  const openSocket = useCallback(
    (info: RobotInfo) => {
      const candidates = [wsUrl(info)];
      if (info.via === 'same-origin' && typeof window !== 'undefined') {
        candidates.push(`ws://${window.location.hostname}:${PROTOCOL.wsPort}`);
      } else if (typeof window !== 'undefined' && info.host) {
        const host = info.host.replace(/^https?:\/\//, '').split(':')[0];
        candidates.push(`ws://${window.location.host}/ws`);
        candidates.push(`ws://${host}:${PROTOCOL.wsPort}`);
      }

      const tryNext = (i: number) => {
        if (i >= candidates.length) return;
        let ws: WebSocket;
        try {
          ws = new WebSocket(candidates[i]);
        } catch {
          tryNext(i + 1);
          return;
        }
        wsRef.current = ws;
        ws.onmessage = (ev) => {
          try {
            const parsed = JSON.parse(String(ev.data)) as {
              type?: string;
              status?: RobotStatus;
              values?: { a0?: number };
            };
            if (parsed.status) applyStatus(parsed.status);
            if (parsed.type === 'ads1115_values' && parsed.values?.a0 != null) {
              const v = parsed.values.a0;
              const pct = Math.max(0, Math.min(100, ((v - 10) / 6) * 100));
              setStatus((prev) => (prev ? { ...prev, batteryPct: pct } : prev));
            }
            if (parsed.type === 'program_status') {
              setStatus((prev) =>
                prev ? { ...prev, programOn: (parsed as { status?: string }).status === 'on' } : prev,
              );
            }
          } catch {
            /* ignore */
          }
        };
        ws.onopen = () => {
          setTransport('ws');
          sendJson({ type: 'get_program_status' });
          sendJson({ type: 'get_ads1115_values' });
        };
        ws.onerror = () => {
          if (wsRef.current === ws) tryNext(i + 1);
        };
        ws.onclose = () => {
          if (wsRef.current === ws) wsRef.current = null;
        };
      };
      tryNext(0);
    },
    [applyStatus, sendJson],
  );

  const connect = useCallback(
    async (info: RobotInfo) => {
      if (busyRef.current) return false;
      busyRef.current = true;
      setPhase('connecting');
      setError(null);
      teardownLink();
      try {
        const probed = (await probeRobot(info)) ?? info;
        activeRef.current = probed;
        setActive(probed);
        await saveLastRobot(probed);

        const pairs = await fetchMotorPairs(probed);
        if (pairs) pairsRef.current = pairs;

        const udp = probed.via !== 'same-origin' && udpAvailable() ? openUdpControl(probed, applyStatus) : null;
        udpRef.current = udp;
        setTransport(udp ? 'udp' : 'ws');
        openSocket(probed);

        try {
          const [st, eps] = await Promise.all([fetchStatus(probed), fetchEndpoints(probed)]);
          setStatus(st);
          setEndpoints(eps);
        } catch {
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
            { method: 'WS', path: `ws://${probed.host}:${probed.wsPort || 8765}`, summary: 'Sterowanie Gremlin' },
            { method: 'HTTP', path: `http://${probed.host}:${probed.sitePort || 3000}`, summary: 'Panel na Raspberry Pi' },
          ]);
        }

        pollRef.current = setInterval(() => {
          const current = activeRef.current;
          if (!current) return;
          fetchStatus(current).then(applyStatus).catch(() => undefined);
          sendJson({ type: 'get_ads1115_values' });
        }, 500);

        setPhase('online');
        setRobots((prev) => [probed, ...prev.filter((r) => r.id !== probed.id)]);
        return true;
      } catch {
        setPhase('offline');
        setError('Nie udało się połączyć z Gremlinem (WS :8765 / panel HTTP).');
        return false;
      } finally {
        busyRef.current = false;
      }
    },
    [applyStatus, openSocket, sendJson, teardownLink],
  );

  const scanOnce = useCallback(async () => {
    const last = await loadLastRobot();
    const env = envHost();
    const httpFound = await probeMany([
      ...(env ? [env] : []),
      ...(last ? [{ ...last, via: last.via || 'http' }] : []),
      ...webHttpCandidates(),
    ]);
    let udpFound: RobotInfo[] = [];
    try {
      udpFound = await discoverRobots(PROTOCOL.discoverTimeoutMs);
    } catch {
      udpFound = [];
    }
    const merged = new Map<string, RobotInfo>();
    for (const r of udpFound) merged.set(r.id, r);
    if (httpFound) merged.set(httpFound.id, httpFound);
    const list = [...merged.values()];
    setRobots(list);
    return { list, httpFound, udpFound };
  }, []);

  const autoConnect = useCallback(async () => {
    setPhase('searching');
    setError(null);
    const { list, httpFound, udpFound } = await scanOnce();
    const last = await loadLastRobot();
    const preferred =
      (last && list.find((r) => r.id === last.id || r.host === last.host)) ||
      httpFound ||
      udpFound[0] ||
      list[0];
    if (preferred) {
      await connect(preferred);
      return;
    }
    setPhase('offline');
    setError('Nie znaleziono Gremlina w sieci. Szukam dalej broadcastem UDP.');
  }, [connect, scanOnce]);

  useEffect(() => {
    void autoConnect();
    return () => {
      stopScanLoop();
      teardownLink();
    };
  }, [autoConnect, teardownLink]);

  useEffect(() => {
    if (phase === 'online') {
      stopScanLoop();
      return;
    }
    if (scanRef.current) return;
    scanRef.current = setInterval(() => {
      void (async () => {
        const { list, httpFound, udpFound } = await scanOnce();
        const next = httpFound || udpFound[0] || list[0];
        if (next) await connect(next);
      })();
    }, 2500);
    return stopScanLoop;
  }, [phase, connect, scanOnce]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && phase !== 'online') void autoConnect();
    });
    return () => sub.remove();
  }, [autoConnect, phase]);

  const startDriveLoop = useCallback(() => {
    if (driveTimer.current) return;
    driveTimer.current = setInterval(() => {
      const { vy, vx, omega, moving } = driveRef.current;
      if (!moving) return;
      sendMotors(vy, vx, omega);
    }, Math.round(1000 / PROTOCOL.driveHz));
  }, [sendMotors]);

  const drive = useCallback(
    (x: number, y: number, omega = 0) => {
      const vx = clampStick(x);
      const vy = clampStick(y);
      const w = clampStick(omega);
      const moving = Math.hypot(vx, vy, w) > 0.04;
      driveRef.current = { vy, vx, omega: w, moving };
      if (moving) startDriveLoop();
      else sendMotors(0, 0, 0);
    },
    [sendMotors, startDriveLoop],
  );

  const setOmega = useCallback(
    (omega: number) => {
      const { vx, vy } = driveRef.current;
      drive(vx, vy, omega);
    },
    [drive],
  );

  const stop = useCallback(() => {
    driveRef.current = { vy: 0, vx: 0, omega: 0, moving: false };
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
      const info: RobotInfo = {
        id: `manual-${trimmed}`,
        name: 'Gremlin',
        host: trimmed.replace(/\/$/, ''),
        httpPort: PROTOCOL.httpPort,
        wsPort: PROTOCOL.wsPort,
        sitePort: PROTOCOL.sitePort,
        udpPort: PROTOCOL.discoverPort,
        proto: PROTOCOL.proto,
        via: 'manual',
      };
      if (trimmed.includes('://')) {
        try {
          const url = new URL(trimmed);
          info.host = trimmed.replace(/\/$/, '');
          info.httpPort = url.port ? Number(url.port) : 80;
        } catch {
          /* keep */
        }
      } else if (trimmed.includes(':')) {
        const [h, p] = trimmed.split(':');
        info.host = h;
        info.httpPort = Number(p) || PROTOCOL.httpPort;
      }
      return connect(info);
    },
    [connect],
  );

  const disconnect = useCallback(() => {
    stop();
    teardownLink();
    activeRef.current = null;
    setActive(null);
    setStatus(null);
    setPhase('offline');
  }, [stop, teardownLink]);

  const updatePower = useCallback((p: number) => {
    const v = clampStick(p) < 0 ? 0 : Math.min(1, p);
    powerRef.current = v;
    setPower(v);
    sendJson({ type: 'set_follow_band_speed', pwm: powerToPwm(v) });
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
    sendJson,
  };
}
