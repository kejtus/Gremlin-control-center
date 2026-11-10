import { Buffer } from 'buffer';

export const PROTOCOL = {
  magicDiscover: 'GREMLIN_DISCOVER',
  magicHere: 'GREMLIN_HERE',
  discoverPort: 45454,
  controlPort: 45455,
  wsPort: 8765,
  sitePort: 3000,
  httpPort: 8742,
  /** Tymczasowo na sztywno — prawdziwe Pi, nie lokalny dummy. */
  defaultPiHost: '192.168.1.215',
  proto: 1,
  driveHz: 20,
  safetyTimeoutMs: 350,
  discoverTimeoutMs: 1800,
  maxPwm: 4095,
  /** Twardy limit wyjścia silników z apki (bezpieczeństwo). */
  driveMaxPwm: 2000,
  videoUdpPort: 9000,
  videoBridgePort: 8766,
  controlProxyPort: 8768,
  sttPort: 8769,
  sttHttpsPort: 8770,
  /** ESP LiDAR WebSocket — ws://<pi>:8769/ws/esp_lidar (ESP_LIDAR_3D_EXPO.md). */
  espLidarWsPort: 8769,
  espLidarWsPath: '/ws/esp_lidar',
  /** Opcjonalny UDP ELDP forward (nie wymagany przy WebSocket). */
  espLidarUdpPort: 5010,
  videoMaxFps: 24,
  videoMaxJpegBytes: 700_000,
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
  wheels?: { FL?: number; FR?: number; RL?: number; RR?: number };
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

export type RobotConfig = {
  motors?: MotorPairs;
  ws_server?: { host?: string; port?: number; bind_host?: string };
};

/** Hostname without scheme or port. */
export function robotHostname(host: string): string {
  return host.replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
}

export function defaultPiInfo(): RobotInfo {
  return {
    id: 'gremlin-pi',
    name: 'Gremlin',
    host: PROTOCOL.defaultPiHost,
    httpPort: PROTOCOL.sitePort,
    wsPort: PROTOCOL.wsPort,
    sitePort: PROTOCOL.sitePort,
    udpPort: PROTOCOL.discoverPort,
    proto: PROTOCOL.proto,
    via: 'ws',
  };
}

export function isDummyTarget(info: Pick<RobotInfo, 'host' | 'httpPort' | 'via'>): boolean {
  const host = robotHostname(info.host).toLowerCase();
  if (info.via === 'same-origin') return true;
  if (info.httpPort === PROTOCOL.httpPort) return true;
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

/**
 * Bare IP → panel Gremlina :3000 (prawdziwe Pi).
 * :8742 zostawiamy na symulator. Nie zgadujemy :80 — to daje connection refused.
 */
export function parseRobotAddress(raw: string): { host: string; httpPort: number } {
  const trimmed = raw.trim().replace(/\/$/, '');
  if (!trimmed) return { host: '', httpPort: PROTOCOL.sitePort };
  try {
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      const url = new URL(trimmed);
      const port = url.port
        ? Number(url.port)
        : trimmed.startsWith('https://')
          ? 443
          : PROTOCOL.sitePort;
      return { host: url.hostname, httpPort: port };
    }
  } catch {
    /* fall through */
  }
  const colon = trimmed.lastIndexOf(':');
  if (colon > 0 && /^\d+$/.test(trimmed.slice(colon + 1))) {
    return { host: trimmed.slice(0, colon), httpPort: Number(trimmed.slice(colon + 1)) };
  }
  return { host: trimmed, httpPort: PROTOCOL.sitePort };
}

export function httpBase(info: Pick<RobotInfo, 'host' | 'httpPort'>): string {
  if (!info.host) return '';
  if (info.host.startsWith('http://') || info.host.startsWith('https://')) {
    return info.host.replace(/\/$/, '');
  }
  const host = robotHostname(info.host);
  const port = info.httpPort || PROTOCOL.sitePort;
  return `http://${host}:${port}`;
}

export function siteUrl(info: RobotInfo): string {
  const host = robotHostname(info.host);
  return `http://${host}:${info.sitePort || PROTOCOL.sitePort}`;
}

export function videoWsUrl(info: Pick<RobotInfo, 'host' | 'sitePort'>): string {
  const host = robotHostname(info.host);
  return `ws://${host}:${info.sitePort || PROTOCOL.sitePort}/video`;
}

export function soundControlPath(fileName: string): string {
  const name = fileName.replace(/^\/+/, '');
  return name.startsWith('sounds/') ? name : `sounds/${name}`;
}

export const FALLBACK_SOUNDS = [
  'bark.mp3',
  'bark-fart_XRsy1HE.mp3',
  'chicken-on-tree-screaming.mp3',
  'oiia-oiia-sound.mp3',
  'tiki-tiki-boosted.mp3',
  'u_w4utmqapnm-seals-in-ed-edd-n-eddy-154201.mp3',
];

/** Kolejność jak zakładka System status w panelu Gremlina. */
export const SYSTEM_STATUS_DEVICES = ['OAK-D', 'LIDAR', 'MIC', 'SPEAKER', 'ADS1115', 'I2C', 'SD-CARD'] as const;

/** Urządzenia sterowane z zakładki Status (włącz/wyłącz). */
export const CONTROLLABLE_DEVICES = ['OAK-D', 'LIDAR', 'MIC', 'SPEAKER'] as const;
export type ControllableDevice = (typeof CONTROLLABLE_DEVICES)[number];

export type DevicePowerMap = Partial<Record<ControllableDevice, boolean>>;

export type DevicePowerStatus = Record<ControllableDevice, boolean>;

export function fullDevicePower(map: DevicePowerMap): DevicePowerStatus {
  return {
    'OAK-D': map['OAK-D'] !== false,
    LIDAR: map.LIDAR !== false,
    MIC: map.MIC !== false,
    SPEAKER: map.SPEAKER !== false,
  };
}

/**
 * App → Pi (WebSocket): pełny stan komponentów.
 *
 * ```json
 * {
 *   "type": "device_power_status",
 *   "devices": {
 *     "OAK-D": true,
 *     "LIDAR": true,
 *     "MIC": false,
 *     "SPEAKER": true
 *   }
 * }
 * ```
 */
export function devicePowerStatusPacket(map: DevicePowerMap) {
  return {
    type: 'device_power_status' as const,
    devices: fullDevicePower(map),
  };
}

/**
 * App → Pi: zapytaj o aktualny stan (Pi odpowiada tym samym kształtem `device_power_status`).
 *
 * ```json
 * { "type": "get_device_power" }
 * ```
 */
export function getDevicePowerPacket() {
  return { type: 'get_device_power' as const };
}

/**
 * Pi → App / App → Pi: ten sam kształt JSON.
 *
 * ```json
 * {
 *   "type": "device_power_status",
 *   "devices": {
 *     "OAK-D": true,
 *     "LIDAR": true,
 *     "MIC": false,
 *     "SPEAKER": true
 *   }
 * }
 * ```
 */
export type DevicePowerStatusMsg = {
  type: 'device_power_status';
  devices?: DevicePowerMap;
};

export function parseDevicePowerStatus(parsed: Record<string, unknown>): DevicePowerMap | null {
  if (parsed.type !== 'device_power_status') return null;
  const raw = parsed.devices;
  if (!raw || typeof raw !== 'object') return null;
  const out: DevicePowerMap = {};
  for (const key of CONTROLLABLE_DEVICES) {
    if (key in (raw as object)) {
      out[key] = Boolean((raw as Record<string, unknown>)[key]);
    }
  }
  return out;
}

/** Heurystyka ON z logu statusu, gdy Pi jeszcze nie odesłało device_power_status. */
export function inferDevicePowerFromStatus(raw: string | undefined): boolean | null {
  if (!raw) return null;
  const s = raw.toUpperCase();
  if (s.includes('ERROR') || s.includes('OFF') || s.includes('DISABLED')) return false;
  if (s.includes('SUCCESS') || s.includes('DUMMY') || s.includes('FALLBACK') || s.includes('ON')) {
    return true;
  }
  return null;
}

export type SystemStatusKind = 'success' | 'dummy' | 'fallback' | 'error' | 'unknown';

export type AdsValues = {
  a0?: number;
  a1?: number;
  a2?: number;
  a3?: number;
};

export type NoiseProfileStatus = {
  is_calibrating?: boolean;
  has_profile?: boolean;
};

export type AudioFilterConfig = {
  lidar_enabled?: boolean;
  motor_enabled?: boolean;
  lidar_center_hz?: number;
  motor_center_hz?: number;
};

export function classifySystemStatus(status: string): SystemStatusKind {
  const s = status.toUpperCase();
  if (s.includes('FALLBACK')) return 'fallback';
  if (s.includes('ERROR')) return 'error';
  if (s.includes('DUMMY')) return 'dummy';
  if (s.includes('SUCCESS')) return 'success';
  return 'unknown';
}

export function parseSystemStatusLog(content: string): Record<string, string> {
  const latest: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const space = trimmed.indexOf(' ');
    if (space === -1) continue;
    latest[trimmed.slice(0, space)] = trimmed.slice(space + 1);
  }
  return latest;
}

export function decodeStatusFile(b64: string): string {
  try {
    return Buffer.from(b64, 'base64').toString('utf8');
  } catch {
    return '';
  }
}

export function wsCandidates(info: Pick<RobotInfo, 'host' | 'wsPort' | 'httpPort' | 'via'>): string[] {
  const host = robotHostname(info.host);
  const wsPort = info.wsPort || PROTOCOL.wsPort;
  const urls: string[] = [];
  // Same-origin /ws tylko gdy UI jest serwowane z agenta (symulator :8742).
  // Panel Gremlina na :3000 niszczy upgrade inny niż /video — to jest connection refused.
  if (info.via === 'same-origin' && typeof window !== 'undefined' && window.location?.host) {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    urls.push(`${proto}//${window.location.host}/ws`);
  }
  if (host) {
    urls.push(`ws://${host}:${wsPort}`);
    if (
      info.httpPort &&
      info.httpPort !== PROTOCOL.sitePort &&
      info.httpPort !== wsPort &&
      info.httpPort !== 80 &&
      info.httpPort !== 443
    ) {
      urls.push(`ws://${host}:${info.httpPort}/ws`);
    }
  }
  return [...new Set(urls.filter(Boolean))];
}

export function wsUrl(info: Pick<RobotInfo, 'host' | 'wsPort' | 'httpPort' | 'via'>): string {
  return wsCandidates(info)[0] || `ws://127.0.0.1:${PROTOCOL.wsPort}`;
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
