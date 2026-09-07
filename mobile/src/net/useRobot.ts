import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import {
  PROTOCOL,
  clampStick,
  type EndpointInfo,
  type RobotInfo,
  type RobotStatus,
} from '../protocol';
import { loadLastRobot, saveLastRobot } from '../storage';
import {
  fetchEndpoints,
  fetchStatus,
  postCommand,
  postDrive,
  postStop,
  probeRobot,
  sameOriginInfo,
} from './http';
import { openUdpControl, type UdpLink } from './udpControl';
import { discoverRobots, udpAvailable } from './udpDiscover';

export type Phase = 'booting' | 'searching' | 'connecting' | 'online' | 'offline';

function envHost(): RobotInfo | null {
  const raw = process.env.EXPO_PUBLIC_ROBOT_HOST;
  if (!raw) return null;
  try {
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      const url = new URL(raw);
      return {
        id: 'env',
        name: 'Robot',
        host: raw.replace(/\/$/, ''),
        httpPort: url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80,
        udpPort: PROTOCOL.controlPort,
        proto: PROTOCOL.proto,
        via: 'http',
      };
    }
    const [host, port] = raw.split(':');
    return {
      id: 'env',
      name: 'Robot',
      host,
      httpPort: port ? Number(port) : PROTOCOL.httpPort,
      udpPort: PROTOCOL.controlPort,
      proto: PROTOCOL.proto,
      via: 'http',
    };
  } catch {
    return null;
  }
}

function webHttpCandidates(): RobotInfo[] {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return [];
  const { hostname, protocol, port } = window.location;
  const items: RobotInfo[] = [sameOriginInfo()];
  if (hostname) {
    items.push({
      id: 'lan-default',
      name: 'Robot w sieci',
      host: hostname,
      httpPort: PROTOCOL.httpPort,
      udpPort: PROTOCOL.controlPort,
      proto: PROTOCOL.proto,
      via: 'http',
    });
    const currentPort = port ? Number(port) : protocol === 'https:' ? 443 : 80;
    if (currentPort !== PROTOCOL.httpPort) {
      items.push({
        id: 'same-host-agent',
        name: 'Agent na tym hoście',
        host: `${protocol}//${hostname}:${PROTOCOL.httpPort}`,
        httpPort: PROTOCOL.httpPort,
        udpPort: PROTOCOL.controlPort,
        proto: PROTOCOL.proto,
        via: 'http',
      });
    }
  }
  return items;
}

async function probeMany(candidates: RobotInfo[]): Promise<RobotInfo | null> {
  const unique = new Map<string, RobotInfo>();
  for (const c of candidates) {
    unique.set(`${c.host}:${c.httpPort}`, c);
  }
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
  const [transport, setTransport] = useState<'udp' | 'ws' | 'http'>('http');

  const seq = useRef(1);
  const wsRef = useRef<WebSocket | null>(null);
  const udpRef = useRef<UdpLink | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scanRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeRef = useRef<RobotInfo | null>(null);
  const driveRef = useRef({ x: 0, y: 0, moving: false });
  const driveTimer = useRef<ReturnType<typeof setInterval> | null>(null);
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
      // ignore
    }
    wsRef.current = null;
    udpRef.current?.close();
    udpRef.current = null;
  }, []);

  const applyStatus = useCallback((next: RobotStatus) => {
    setStatus(next);
  }, []);

  const openWebSocket = useCallback((info: RobotInfo) => {
    const base = info.host.startsWith('http') ? info.host : `http://${info.host}:${info.httpPort}`;
    let url: URL;
    try {
      url = new URL(base);
    } catch {
      return false;
    }
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = '/ws/control';
    url.search = '';
    try {
      const ws = new WebSocket(url.toString());
      wsRef.current = ws;
      ws.onmessage = (ev) => {
        try {
          const parsed = JSON.parse(String(ev.data)) as { t?: string; status?: RobotStatus };
          if (parsed.status) applyStatus(parsed.status);
        } catch {
          // ignore
        }
      };
      ws.onopen = () => setTransport((t) => (t === 'udp' ? t : 'ws'));
      ws.onerror = () => {
        /* polling remains as fallback */
      };
      ws.onclose = () => {
        if (wsRef.current === ws) wsRef.current = null;
      };
      return true;
    } catch {
      return false;
    }
  }, [applyStatus]);

  const sendPacket = useCallback((packet: object) => {
    if (udpRef.current) {
      udpRef.current.send(packet);
      return;
    }
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(packet));
    }
  }, []);

  const connect = useCallback(
    async (info: RobotInfo) => {
      if (busyRef.current) return false;
      busyRef.current = true;
      setPhase('connecting');
      setError(null);
      teardownLink();
      try {
      const probed = await probeRobot(info);
      if (!probed) {
        setPhase('offline');
        setError('Robot nie odpowiada na HTTP. Sprawdź sieć Wi‑Fi i adres.');
        return false;
      }
      activeRef.current = probed;
      setActive(probed);
      await saveLastRobot(probed);

      const udp = probed.via !== 'same-origin' && udpAvailable() ? openUdpControl(probed, applyStatus) : null;
      udpRef.current = udp;
      setTransport(udp ? 'udp' : 'http');
      openWebSocket(probed);

      try {
        const [st, eps] = await Promise.all([fetchStatus(probed), fetchEndpoints(probed)]);
        setStatus(st);
        setEndpoints(eps);
      } catch {
        setEndpoints([]);
      }

      pollRef.current = setInterval(() => {
        const current = activeRef.current;
        if (!current) return;
        fetchStatus(current).then(applyStatus).catch(() => {
          setPhase((p) => (p === 'online' ? 'offline' : p));
        });
      }, 400);

      setPhase('online');
      setRobots((prev) => {
        const rest = prev.filter((r) => r.id !== probed.id);
        return [probed, ...rest];
      });
      return true;
    },
    [applyStatus, openWebSocket, teardownLink],
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
    setError('Nie znaleziono robota w sieci. Zostaw aplikację otwartą — szukam dalej.');
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
        if (phase === 'searching' || phase === 'offline' || phase === 'booting') {
          const next = httpFound || udpFound[0] || list[0];
          if (next) await connect(next);
        }
      })();
    }, 2500);
    return stopScanLoop;
  }, [phase, connect, scanOnce]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && phase !== 'online') {
        void autoConnect();
      }
    });
    return () => sub.remove();
  }, [autoConnect, phase]);

  const startDriveLoop = useCallback(() => {
    if (driveTimer.current) return;
    driveTimer.current = setInterval(() => {
      const { x, y, moving } = driveRef.current;
      if (!moving) return;
      const packet = { t: 'drive', x, y, seq: seq.current++ };
      sendPacket(packet);
      const info = activeRef.current;
      if (!udpRef.current && !(wsRef.current && wsRef.current.readyState === WebSocket.OPEN) && info) {
        void postDrive(info, x, y).catch(() => undefined);
      }
    }, Math.round(1000 / PROTOCOL.driveHz));
  }, [sendPacket]);

  const drive = useCallback(
    (x: number, y: number) => {
      const nx = clampStick(x);
      const ny = clampStick(y);
      const moving = Math.hypot(nx, ny) > 0.04;
      driveRef.current = { x: nx, y: ny, moving };
      if (moving) startDriveLoop();
      else {
        sendPacket({ t: 'stop', seq: seq.current++ });
        const info = activeRef.current;
        if (info && !udpRef.current) void postStop(info).catch(() => undefined);
      }
    },
    [sendPacket, startDriveLoop],
  );

  const stop = useCallback(() => {
    driveRef.current = { x: 0, y: 0, moving: false };
    sendPacket({ t: 'stop', seq: seq.current++ });
    const info = activeRef.current;
    if (info) void postStop(info).catch(() => undefined);
  }, [sendPacket]);

  const command = useCallback(async (name: string) => {
    sendPacket({ t: 'cmd', name, seq: seq.current++ });
    const info = activeRef.current;
    if (info) await postCommand(info, name);
  }, [sendPacket]);

  const connectManual = useCallback(
    async (host: string) => {
      const trimmed = host.trim();
      if (!trimmed) return false;
      const info: RobotInfo = {
        id: `manual-${trimmed}`,
        name: 'Robot',
        host: trimmed.replace(/\/$/, ''),
        httpPort: PROTOCOL.httpPort,
        udpPort: PROTOCOL.controlPort,
        proto: PROTOCOL.proto,
        via: 'manual',
      };
      if (trimmed.includes('://')) {
        try {
          const url = new URL(trimmed);
          info.host = trimmed.replace(/\/$/, '');
          info.httpPort = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80;
        } catch {
          // keep as typed
        }
      } else if (trimmed.includes(':') && !trimmed.includes('://')) {
        const [h, p] = trimmed.split(':');
        info.host = h;
        info.httpPort = Number(p) || PROTOCOL.httpPort;
      }
      return connect(info);
    },
    [connect],
  );

  const disconnect = useCallback(() => {
    teardownLink();
    activeRef.current = null;
    setActive(null);
    setStatus(null);
    setPhase('offline');
  }, [teardownLink]);

  return {
    phase,
    robots,
    active,
    status,
    endpoints,
    error,
    transport,
    udpAvailable: udpAvailable(),
    drive,
    stop,
    command,
    connect,
    connectManual,
    disconnect,
    retry: autoConnect,
  };
}
