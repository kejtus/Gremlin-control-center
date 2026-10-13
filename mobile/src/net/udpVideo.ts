import { localVideoBridgeUrl, openJpegWs, type VideoEvent, type VideoLink } from './jpegWs';

export type { VideoEvent, VideoLink };

/** Web nie odbiera UDP — mostek na tym komputerze (`npm run video-bridge`). */
export function openVideoIngress(
  _port: number,
  onFrame: (jpeg: Uint8Array) => void,
  onEvent?: (ev: VideoEvent) => void,
): VideoLink | null {
  return openJpegWs(localVideoBridgeUrl(), onFrame, onEvent);
}
