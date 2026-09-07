export const PROTOCOL = {
  magicDiscover: 'GREMLIN_DISCOVER',
  magicHere: 'GREMLIN_HERE',
  discoverPort: 45454,
  controlPort: 45455,
  wsPort: 8765,
  sitePort: 3000,
  httpPort: 8742,
  proto: 1,
  driveHz: 20,
  safetyTimeoutMs: 350,
  discoverTimeoutMs: 1800,
  maxPwm: 4095,
} as const;

export type RobotInfo = {
  id: string;
  name: string;
  host: string;
  httpPort: number;
  wsPort: number;
  sitePort: number;
  udpPort: number;
  proto: number;
  via: 'udp' | 'http' | 'same-origin' | 'manual' | 'ws';
};

export type RobotStatus = {
  id: string;
  name: string;
  connected: boolean;
  uptimeSec: number;
  batteryPct: number;
  motors: { left: number; right: number };
  channels?: Record<number, number>;
  pose: { x: number; y: number; heading: number };
  lights: boolean;
  estop: boolean;
  lastCommandAgeMs: number | null;
  clients: number;
  mode: 'sim' | 'gpio' | 'gremlin';
  programOn?: boolean;
  followBand?: boolean;
  pwmPeak?: number;
  arena: { width: number; height: number };
};

export type EndpointInfo = {
  method: string;
  path: string;
  summary: string;
};

export type MotorPairs = Record<string, [number, number]>;

export function httpBase(info: Pick<RobotInfo, 'host' | 'httpPort'>): string {
  if (!info.host) return '';
  if (info.host.startsWith('http://') || info.host.startsWith('https://')) {
    return info.host.replace(/\/$/, '');
  }
  return `http://${info.host}:${info.httpPort}`;
}

export function siteUrl(info: RobotInfo): string {
  const host = info.host.replace(/^https?:\/\//, '').split(':')[0];
  return `http://${host}:${info.sitePort || PROTOCOL.sitePort}`;
}

export function wsUrl(info: Pick<RobotInfo, 'host' | 'wsPort' | 'httpPort' | 'via'>): string {
  if (info.via === 'same-origin' && typeof window !== 'undefined') {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/ws`;
  }
  const host = info.host.replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
  return `ws://${host}:${info.wsPort || PROTOCOL.wsPort}`;
}

export function clampStick(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(-1, Math.min(1, v));
}

export function parseHerePayload(raw: string, fromHost: string): RobotInfo | null {
  const text = raw.trim();
  const nl = text.indexOf('\n');
  const head = nl === -1 ? text : text.slice(0, nl);
  const body = nl === -1 ? '' : text.slice(nl + 1);
  if (!head.startsWith(PROTOCOL.magicHere) && !head.startsWith('RPILOT_HERE')) return null;
  try {
    const json = JSON.parse(body || '{}') as Partial<RobotInfo>;
    if (!json.id && !json.name) return null;
    return {
      id: json.id || 'gremlin',
      name: json.name || 'Gremlin',
      host: json.host || fromHost,
      httpPort: json.httpPort || PROTOCOL.httpPort,
      wsPort: json.wsPort || PROTOCOL.wsPort,
      sitePort: json.sitePort || PROTOCOL.sitePort,
      udpPort: json.udpPort || PROTOCOL.discoverPort,
      proto: json.proto || PROTOCOL.proto,
      via: 'udp',
    };
  } catch {
    return null;
  }
}
