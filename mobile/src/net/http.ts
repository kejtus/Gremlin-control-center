import {
  PROTOCOL,
  httpBase,
  robotHostname,
  type EndpointInfo,
  type MotorPairs,
  type RobotConfig,
  type RobotInfo,
  type RobotStatus,
} from '../protocol';

const PROBE_MS = 900;

async function fetchJson<T>(url: string, init?: RequestInit, timeoutMs = 4000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: {
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

function probeBases(info: RobotInfo): string[] {
  const host = robotHostname(info.host);
  if (!host && !info.host.startsWith('http')) return httpBase(info) ? [httpBase(info)] : [];
  const realPi = host === PROTOCOL.defaultPiHost;
  const ports = realPi
    ? [PROTOCOL.sitePort]
    : [info.httpPort, PROTOCOL.sitePort, PROTOCOL.httpPort];
  const bases: string[] = [];
  if (info.host.startsWith('http://') || info.host.startsWith('https://')) {
    bases.push(info.host.replace(/\/$/, ''));
  }
  for (const port of ports) {
    if (!Number.isFinite(port) || port <= 0) continue;
    if (realPi && port === PROTOCOL.httpPort) continue;
    bases.push(`http://${host}:${port}`);
  }
  return [...new Set(bases.filter(Boolean))];
}

function fromConfig(info: RobotInfo, base: string, cfg?: RobotConfig, meta?: Partial<RobotInfo>): RobotInfo {
  let port = info.httpPort;
  try {
    port = Number(new URL(base).port) || info.httpPort;
  } catch {
    /* keep */
  }
  return {
    ...info,
    ...meta,
    host: robotHostname(info.host) || info.host,
    httpPort: port,
    wsPort: cfg?.ws_server?.port || meta?.wsPort || info.wsPort || PROTOCOL.wsPort,
    sitePort: port === PROTOCOL.httpPort ? info.sitePort || PROTOCOL.sitePort : port || PROTOCOL.sitePort,
  };
}

export async function probeRobot(info: RobotInfo): Promise<RobotInfo | null> {
  for (const base of probeBases(info)) {
    try {
      const data = await fetchJson<{
        id?: string;
        name?: string;
        httpPort?: number;
        wsPort?: number;
        sitePort?: number;
        udpPort?: number;
        proto?: number;
        motors?: MotorPairs;
      }>(`${base}/api/info`, undefined, PROBE_MS);
      return fromConfig(info, base, undefined, {
        id: data.id || info.id,
        name: data.name || info.name,
        httpPort: data.httpPort || Number(new URL(base).port) || info.httpPort,
        wsPort: data.wsPort || info.wsPort,
        sitePort: data.sitePort || info.sitePort,
        udpPort: data.udpPort || info.udpPort,
        proto: data.proto || info.proto,
      });
    } catch {
      try {
        const cfg = await fetchJson<RobotConfig>(`${base}/api/robot-config`, undefined, PROBE_MS);
        return fromConfig(info, base, cfg);
      } catch {
        // try next base — :8742 na żywym Pi kończy się connection refused, potem :3000
      }
    }
  }
  return null;
}

export async function fetchStatus(info: Pick<RobotInfo, 'host' | 'httpPort'>): Promise<RobotStatus> {
  return fetchJson<RobotStatus>(`${httpBase(info)}/api/status`);
}

export async function fetchEndpoints(info: Pick<RobotInfo, 'host' | 'httpPort'>): Promise<EndpointInfo[]> {
  try {
    const data = await fetchJson<{ endpoints: EndpointInfo[] }>(`${httpBase(info)}/api/endpoints`);
    return data.endpoints;
  } catch {
    return [
      { method: 'WS', path: `ws://<ip>:${PROTOCOL.wsPort}`, summary: 'Sterowanie Gremlin' },
      { method: 'GET', path: '/api/robot-config', summary: 'Mapowanie silników' },
    ];
  }
}

export async function fetchMotorPairs(info: Pick<RobotInfo, 'host' | 'httpPort'>): Promise<MotorPairs | null> {
  try {
    const cfg = await fetchJson<{ motors?: MotorPairs }>(`${httpBase(info)}/api/robot-config`, undefined, 1500);
    return cfg.motors ?? null;
  } catch {
    return null;
  }
}

export async function fetchSounds(info: Pick<RobotInfo, 'host' | 'httpPort' | 'sitePort'>): Promise<string[]> {
  const host = robotHostname(info.host);
  const bases = [
    `http://${host}:${info.sitePort || PROTOCOL.sitePort}`,
    httpBase(info),
  ].filter(Boolean);
  const unique = [...new Set(bases)];
  for (const base of unique) {
    try {
      const data = await fetchJson<{ sounds?: string[] }>(`${base}/api/sounds`, undefined, 2500);
      if (Array.isArray(data.sounds) && data.sounds.length > 0) return data.sounds;
    } catch {
      /* next */
    }
  }
  return [];
}

export async function fetchUdpPort(info: Pick<RobotInfo, 'host' | 'httpPort' | 'sitePort'>): Promise<number> {
  const host = robotHostname(info.host);
  try {
    const data = await fetchJson<{ udpPort?: number }>(
      `http://${host}:${info.sitePort || PROTOCOL.sitePort}/api/config`,
      undefined,
      1500,
    );
    return data.udpPort || 9000;
  } catch {
    return 9000;
  }
}

export function sameOriginInfo(): RobotInfo {
  if (typeof window === 'undefined') {
    return {
      id: 'local',
      name: 'Gremlin',
      host: '',
      httpPort: 80,
      wsPort: PROTOCOL.wsPort,
      sitePort: PROTOCOL.sitePort,
      udpPort: PROTOCOL.discoverPort,
      proto: 1,
      via: 'same-origin',
    };
  }
  const { protocol, hostname, port } = window.location;
  const httpPort = port ? Number(port) : protocol === 'https:' ? 443 : 80;
  return {
    id: 'same-origin',
    name: 'Gremlin',
    host: `${protocol}//${hostname}${port ? `:${port}` : ''}`,
    httpPort,
    wsPort: PROTOCOL.wsPort,
    sitePort: PROTOCOL.sitePort,
    udpPort: PROTOCOL.discoverPort,
    proto: 1,
    via: 'same-origin',
  };
}
