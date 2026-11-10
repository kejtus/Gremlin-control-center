import { robotHostname, PROTOCOL } from '../protocol';

/** Aktualnie połączony robot — kamera WS / STT na Pi bez PC. */
let activeHost: string | null = null;
let activeSitePort = PROTOCOL.sitePort;

export function setActiveRobot(host: string | null, sitePort?: number) {
  activeHost = host ? robotHostname(host) : null;
  if (sitePort && sitePort > 0) activeSitePort = sitePort;
}

export function getActiveRobotHost(): string | null {
  return activeHost;
}

export function getActiveSitePort(): number {
  return activeSitePort || PROTOCOL.sitePort;
}
