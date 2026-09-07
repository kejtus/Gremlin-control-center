export const PROTOCOL = {
  magicDiscover: 'RPILOT_DISCOVER',
  magicHere: 'RPILOT_HERE',
  discoverPort: 45454,
  controlPort: 45455,
  httpPort: 8742,
  proto: 1,
  driveHz: 20,
  safetyTimeoutMs: 350,
  discoverTimeoutMs: 1800,
} as const;

export type RobotInfo = {
  id: string;
  name: string;
  host: string;
  httpPort: number;
  udpPort: number;
  proto: number;
  via: 'udp' | 'http' | 'same-origin' | 'manual';
};

export type RobotStatus = {
  id: string;
  name: string;
  connected: boolean;
  uptimeSec: number;
  batteryPct: number;
  motors: { left: number; right: number };
  pose: { x: number; y: number; heading: number };
  lights: boolean;
  estop: boolean;
  lastCommandAgeMs: number | null;
  clients: number;
  mode: 'sim' | 'gpio';
  arena: { width: number; height: number };
};

export type DriveCommand = {
  t: 'drive';
  x: number;
  y: number;
  seq: number;
};

export type StopCommand = {
  t: 'stop';
  seq: number;
};

export type NamedCommand = {
  t: 'cmd';
  name: string;
  seq: number;
};

export type PingCommand = {
  t: 'ping';
  seq: number;
};

export type ControlPacket = DriveCommand | StopCommand | NamedCommand | PingCommand;

export type EndpointInfo = {
  method: string;
  path: string;
  summary: string;
};

export function httpBase(info: Pick<RobotInfo, 'host' | 'httpPort'>): string {
  if (!info.host) return '';
  if (info.host.startsWith('http://') || info.host.startsWith('https://')) {
    return info.host.replace(/\/$/, '');
  }
  return `http://${info.host}:${info.httpPort}`;
}

export function wsUrl(info: Pick<RobotInfo, 'host' | 'httpPort'>): string {
  const base = httpBase(info);
  if (!base) {
    const proto = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${typeof window !== 'undefined' ? window.location.host : '127.0.0.1'}/ws/control`;
  }
  const url = new URL(base);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/ws/control';
  url.search = '';
  return url.toString();
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
  if (!head.startsWith(PROTOCOL.magicHere)) return null;
  try {
    const json = JSON.parse(body || '{}') as Partial<RobotInfo> & { host?: string };
    if (!json.id || !json.name) return null;
    return {
      id: json.id,
      name: json.name,
      host: json.host || fromHost,
      httpPort: json.httpPort || PROTOCOL.httpPort,
      udpPort: json.udpPort || PROTOCOL.controlPort,
      proto: json.proto || PROTOCOL.proto,
      via: 'udp',
    };
  } catch {
    return null;
  }
}
