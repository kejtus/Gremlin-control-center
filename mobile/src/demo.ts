import { PROTOCOL, type RobotInfo, type RobotStatus } from './protocol';

export const UI_PREVIEW_ID = 'ui-preview';

export const DEMO_INFO: RobotInfo = {
  id: UI_PREVIEW_ID,
  name: 'Gremlin',
  host: 'demo',
  httpPort: PROTOCOL.sitePort,
  wsPort: PROTOCOL.wsPort,
  sitePort: PROTOCOL.sitePort,
  udpPort: PROTOCOL.discoverPort,
  proto: PROTOCOL.proto,
  via: 'manual',
};

export const DEMO_STATUS: RobotStatus = {
  id: UI_PREVIEW_ID,
  name: 'Gremlin',
  connected: true,
  uptimeSec: 0,
  batteryPct: 99,
  motors: { left: 0, right: 0 },
  wheels: { FL: 0, FR: 0, RL: 0, RR: 0 },
  pose: { x: 5, y: 5, heading: 0 },
  lights: false,
  estop: false,
  lastCommandAgeMs: null,
  clients: 0,
  mode: 'sim',
  programOn: true,
  arena: { width: 10, height: 10 },
};

export const DEMO_COMPONENTS: Record<string, string> = {
  'OAK-D': 'SUCCESS (podgląd UI)',
  LIDAR: 'SUCCESS (podgląd UI)',
  MIC: 'SUCCESS (podgląd UI)',
  SPEAKER: 'SUCCESS (podgląd UI)',
  ADS1115: 'SUCCESS (podgląd UI)',
  I2C: 'SUCCESS (podgląd UI)',
  'SD-CARD': 'SUCCESS (podgląd UI)',
};

export function isUiPreview(info: Pick<RobotInfo, 'id'> | null | undefined): boolean {
  return info?.id === UI_PREVIEW_ID;
}
