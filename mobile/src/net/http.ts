import { PROTOCOL, httpBase, type EndpointInfo, type MotorPairs, type RobotInfo, type RobotStatus } from '../protocol';

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

export async function probeRobot(info: RobotInfo): Promise<RobotInfo | null> {
  const bases = [
    httpBase(info),
    info.host.startsWith('http') ? '' : `http://${info.host}:${PROTOCOL.sitePort}`,
    info.host.startsWith('http') ? '' : `http://${info.host}:${PROTOCOL.httpPort}`,
  ].filter(Boolean);

  for (const base of bases) {
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
      return {
        id: data.id || info.id,
        name: data.name || info.name,
        host: info.host,
        httpPort: data.httpPort || info.httpPort,
        wsPort: data.wsPort || info.wsPort || PROTOCOL.wsPort,
        sitePort: data.sitePort || info.sitePort || PROTOCOL.sitePort,
        udpPort: data.udpPort || info.udpPort,
        proto: data.proto || info.proto,
        via: info.via,
      };
    } catch {
      try {
        await fetchJson(`${base}/api/robot-config`, undefined, PROBE_MS);
        return {
          ...info,
          host: info.host,
          httpPort: Number(new URL(base).port) || info.httpPort,
          wsPort: info.wsPort || PROTOCOL.wsPort,
          sitePort: info.sitePort || PROTOCOL.sitePort,
        };
      } catch {
        // try next base
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
