import { httpBase, type EndpointInfo, type RobotInfo, type RobotStatus } from '../protocol';

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
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export async function probeRobot(info: Pick<RobotInfo, 'host' | 'httpPort' | 'id' | 'name' | 'udpPort' | 'proto' | 'via'>): Promise<RobotInfo | null> {
  try {
    const data = await fetchJson<{
      id: string;
      name: string;
      httpPort: number;
      udpPort: number;
      proto: number;
    }>(`${httpBase(info)}/api/info`, undefined, PROBE_MS);
    return {
      id: data.id,
      name: data.name,
      host: info.host,
      httpPort: data.httpPort || info.httpPort,
      udpPort: data.udpPort || info.udpPort,
      proto: data.proto || info.proto,
      via: info.via,
    };
  } catch {
    return null;
  }
}

export async function fetchStatus(info: Pick<RobotInfo, 'host' | 'httpPort'>): Promise<RobotStatus> {
  return fetchJson<RobotStatus>(`${httpBase(info)}/api/status`);
}

export async function fetchEndpoints(info: Pick<RobotInfo, 'host' | 'httpPort'>): Promise<EndpointInfo[]> {
  const data = await fetchJson<{ endpoints: EndpointInfo[] }>(`${httpBase(info)}/api/endpoints`);
  return data.endpoints;
}

export async function postDrive(
  info: Pick<RobotInfo, 'host' | 'httpPort'>,
  x: number,
  y: number,
): Promise<void> {
  await fetchJson(`${httpBase(info)}/api/drive`, {
    method: 'POST',
    body: JSON.stringify({ x, y }),
  }, 1500);
}

export async function postStop(info: Pick<RobotInfo, 'host' | 'httpPort'>): Promise<void> {
  await fetchJson(`${httpBase(info)}/api/stop`, { method: 'POST', body: '{}' }, 1500);
}

export async function postCommand(info: Pick<RobotInfo, 'host' | 'httpPort'>, name: string): Promise<void> {
  await fetchJson(`${httpBase(info)}/api/command/${encodeURIComponent(name)}`, {
    method: 'POST',
    body: '{}',
  }, 2000);
}

export function sameOriginInfo(): RobotInfo {
  if (typeof window === 'undefined') {
    return {
      id: 'local',
      name: 'Robot',
      host: '',
      httpPort: 80,
      udpPort: 45455,
      proto: 1,
      via: 'same-origin',
    };
  }
  const { protocol, hostname, port } = window.location;
  const httpPort = port ? Number(port) : protocol === 'https:' ? 443 : 80;
  return {
    id: 'same-origin',
    name: 'Robot',
    host: `${protocol}//${hostname}${port ? `:${port}` : ''}`,
    httpPort,
    udpPort: 45455,
    proto: 1,
    via: 'same-origin',
  };
}
