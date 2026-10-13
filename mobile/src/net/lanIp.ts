function looksLan(ip: string): boolean {
  if (!ip || ip.startsWith('127.') || ip === '0.0.0.0') return false;
  return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(ip);
}

function hostFromUri(raw: string): string | null {
  const cleaned = String(raw)
    .replace(/^exp:\/\//, '')
    .replace(/^https?:\/\//, '')
    .split('/')[0]
    .split(':')[0];
  return looksLan(cleaned) ? cleaned : null;
}

/** IP komputera z Metro/Expo — na telefonie to PC, nie Pi. */
export function getDevServerHost(): string | null {
  // Z ./start.sh — pewny IP PC w LAN (Expo Go offline).
  const fromEnv = String(
    process.env.EXPO_PUBLIC_DEV_SERVER_HOST || process.env.EXPO_PUBLIC_VIDEO_SINK_HOST || '',
  ).trim();
  if (looksLan(fromEnv)) return fromEnv;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { NativeModules } = require('react-native') as {
      NativeModules?: { SourceCode?: { scriptURL?: string } };
    };
    const scriptURL = NativeModules?.SourceCode?.scriptURL;
    if (scriptURL) {
      const m = String(scriptURL).match(/https?:\/\/([^/:]+)/);
      if (m && looksLan(m[1])) return m[1];
    }
  } catch {
    /* web */
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Constants = require('expo-constants');
    const c = (Constants.default ?? Constants) as {
      expoConfig?: { hostUri?: string };
      expoGoConfig?: { debuggerHost?: string };
      linkingUri?: string;
      experienceUrl?: string;
    };
    const fromExpo =
      hostFromUri(c.expoConfig?.hostUri || '') ||
      hostFromUri(c.expoGoConfig?.debuggerHost || '') ||
      hostFromUri(c.linkingUri || '') ||
      hostFromUri(c.experienceUrl || '');
    if (fromExpo) return fromExpo;
  } catch {
    /* missing */
  }
  // Przeglądarka na telefonie: http://PC:41782 → host = PC w LAN (bez internetu).
  try {
    if (typeof window !== 'undefined' && window.location?.hostname) {
      const h = window.location.hostname;
      if (looksLan(h) || h === 'localhost' || h === '127.0.0.1') return h;
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function webrtcLanIp(): Promise<string | null> {
  const RTC = (globalThis as { RTCPeerConnection?: typeof RTCPeerConnection }).RTCPeerConnection;
  if (!RTC) return null;
  return new Promise((resolve) => {
    const pc = new RTC({ iceServers: [] });
    const finish = (ip: string | null) => {
      clearTimeout(timer);
      try {
        pc.close();
      } catch {
        /* ignore */
      }
      resolve(ip);
    };
    const timer = setTimeout(() => finish(null), 1600);
    try {
      pc.createDataChannel('lan');
      pc.onicecandidate = (ev) => {
        const cand = ev.candidate?.candidate ?? '';
        const m = cand.match(/(\d{1,3}(?:\.\d{1,3}){3})/);
        if (m && looksLan(m[1])) finish(m[1]);
      };
      void pc.createOffer().then((offer) => pc.setLocalDescription(offer));
    } catch {
      finish(null);
    }
  });
}

export async function getLanIp(): Promise<string | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Network = require('expo-network') as { getIpAddressAsync?: () => Promise<string> };
    const ip = await Network.getIpAddressAsync?.();
    if (ip && looksLan(ip)) return ip;
  } catch {
    /* web / missing native module */
  }
  return webrtcLanIp();
}

/**
 * Host, na który Pi ma słać JPEG UDP (mostek na PC).
 * Preferuj EXPO_PUBLIC_VIDEO_SINK_HOST z ./start.sh (IP PC w stronę Pi),
 * bo IP z Metro/hotspota bywa z innej sieci niż robot.
 */
export async function getVideoSinkHost(): Promise<string | null> {
  const fromEnv = String(process.env.EXPO_PUBLIC_VIDEO_SINK_HOST || '').trim();
  if (looksLan(fromEnv)) return fromEnv;
  return getDevServerHost() || (await getLanIp());
}
