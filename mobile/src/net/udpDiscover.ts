import type { RobotInfo } from '../protocol';

/** Web / TypeScript fallback — native UDP lives in udpDiscover.native.ts */
export async function discoverRobots(_timeoutMs: number): Promise<RobotInfo[]> {
  return [];
}

export function udpAvailable(): boolean {
  return false;
}
