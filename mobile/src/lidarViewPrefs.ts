import AsyncStorage from '@react-native-async-storage/async-storage';
import { ESP_TILT_DEFAULT } from './lidarEsp';

const KEY = 'rpilot.lidar.view';

/** Domyślna kamera: prawie poziomo (wcześniej pitch 0.55 „patrzył w dół”). */
export const ESP_CAM_DEFAULT = { yaw: 0.25, pitch: 0.28, dist: 4 } as const;

/** Korekta montażu bliżej poziomu (wcześniej −122° mocno „nurkowało”). */
export const ESP_TILT_LEVEL = { x: -90, y: 0, z: 0 } as const;

export type LidarViewPrefs = {
  tilt: { x: number; y: number; z: number };
  cam: { yaw: number; pitch: number; dist: number };
};

const FALLBACK: LidarViewPrefs = {
  tilt: { x: ESP_TILT_LEVEL.x, y: ESP_TILT_LEVEL.y, z: ESP_TILT_LEVEL.z },
  cam: { yaw: ESP_CAM_DEFAULT.yaw, pitch: ESP_CAM_DEFAULT.pitch, dist: ESP_CAM_DEFAULT.dist },
};

/** Cache synchroniczny — zakładka nie gubi kąta przy odmontowaniu. */
let memory: LidarViewPrefs = { ...FALLBACK, tilt: { ...FALLBACK.tilt }, cam: { ...FALLBACK.cam } };
let hydrated = false;

function clampCam(cam: LidarViewPrefs['cam']): LidarViewPrefs['cam'] {
  return {
    yaw: Number.isFinite(cam.yaw) ? cam.yaw : ESP_CAM_DEFAULT.yaw,
    pitch: Math.max(0.08, Math.min(1.45, Number.isFinite(cam.pitch) ? cam.pitch : ESP_CAM_DEFAULT.pitch)),
    dist: Math.max(0.6, Math.min(45, Number.isFinite(cam.dist) ? cam.dist : ESP_CAM_DEFAULT.dist)),
  };
}

function normalize(raw: Partial<LidarViewPrefs> | null | undefined): LidarViewPrefs {
  const tiltIn = raw?.tilt ?? ESP_TILT_LEVEL;
  const camIn = raw?.cam ?? ESP_CAM_DEFAULT;
  return {
    tilt: {
      x: Number.isFinite(tiltIn.x) ? tiltIn.x : ESP_TILT_LEVEL.x,
      y: Number.isFinite(tiltIn.y) ? tiltIn.y : ESP_TILT_LEVEL.y,
      z: Number.isFinite(tiltIn.z) ? tiltIn.z : ESP_TILT_LEVEL.z,
    },
    cam: clampCam({
      yaw: camIn.yaw,
      pitch: camIn.pitch,
      dist: camIn.dist,
    }),
  };
}

export function getLidarViewPrefsSync(): LidarViewPrefs {
  return {
    tilt: { ...memory.tilt },
    cam: { ...memory.cam },
  };
}

export function setLidarViewPrefsMemory(next: Partial<LidarViewPrefs>): LidarViewPrefs {
  memory = normalize({
    tilt: next.tilt ? { ...memory.tilt, ...next.tilt } : memory.tilt,
    cam: next.cam ? { ...memory.cam, ...next.cam } : memory.cam,
  });
  return getLidarViewPrefsSync();
}

export async function loadLidarViewPrefs(): Promise<LidarViewPrefs> {
  if (hydrated) return getLidarViewPrefsSync();
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      memory = normalize(JSON.parse(raw) as Partial<LidarViewPrefs>);
    } else {
      // Stary domyślny CCC (−122/19/−11) → nowy poziom; user i tak może wrócić przyciskiem.
      memory = normalize({
        tilt: { ...ESP_TILT_LEVEL },
        cam: { ...ESP_CAM_DEFAULT },
      });
    }
  } catch {
    memory = normalize(FALLBACK);
  }
  hydrated = true;
  return getLidarViewPrefsSync();
}

export async function saveLidarViewPrefs(next: Partial<LidarViewPrefs>): Promise<LidarViewPrefs> {
  const saved = setLidarViewPrefsMemory(next);
  hydrated = true;
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(saved));
  } catch {
    /* ignore */
  }
  return saved;
}

export function resetLidarViewPrefsDefaults(): LidarViewPrefs {
  return setLidarViewPrefsMemory({
    tilt: { ...ESP_TILT_LEVEL },
    cam: { ...ESP_CAM_DEFAULT },
  });
}

/** Stary preset CCC (dokumentacja / suwaki WWW). */
export function cccLegacyTilt(): { x: number; y: number; z: number } {
  return { x: ESP_TILT_DEFAULT.x, y: ESP_TILT_DEFAULT.y, z: ESP_TILT_DEFAULT.z };
}
