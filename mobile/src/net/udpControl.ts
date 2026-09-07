import type { RobotInfo, RobotStatus } from '../protocol';

export type UdpLink = {
  send: (packet: object) => void;
  close: () => void;
};

export function openUdpControl(
  _info: RobotInfo,
  _onStatus: (status: RobotStatus) => void,
): UdpLink | null {
  return null;
}
