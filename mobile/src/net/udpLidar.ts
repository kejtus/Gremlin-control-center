import type { LidarPoint } from '../lidar';

export type LidarUdpLink = {
  close: () => void;
};

/** Web / Expo Go — brak surowego UDP. */
export function openLidarUdp(
  _onFrame: (points: LidarPoint[]) => void,
  onEvent?: (ev: { type: 'open' | 'error'; message?: string }) => void,
  _port?: number,
): LidarUdpLink | null {
  onEvent?.({ type: 'error', message: 'UDP LiDAR niedostępny w przeglądarce / Expo Go.' });
  return null;
}

export function lidarUdpAvailable(): boolean {
  return false;
}
