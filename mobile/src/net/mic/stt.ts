import { Platform } from 'react-native';
import { getDevServerHost } from '../lanIp';
import { getActiveRobotHost } from '../activeRobot';
import { PROTOCOL } from '../../protocol';

/**
 * Host Whisper.
 * APK: najpierw Pi (połączony robot :8769), potem EXPO_PUBLIC_STT_HOST, potem PC Metro.
 * Na HarmonyOS Intent mowy działa offline względem Whisper; to backup po nagraniu.
 */
export function sttOrigin(): string | null {
  const env = process.env.EXPO_PUBLIC_STT_HOST?.trim();
  if (env) {
    const host = env.replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
    if (host) return `http://${host}:${PROTOCOL.sttPort}`;
  }
  const robot = getActiveRobotHost();
  if (robot) return `http://${robot}:${PROTOCOL.sttPort}`;
  if (Platform.OS === 'web') {
    const host = typeof location !== 'undefined' ? location.hostname : '127.0.0.1';
    return `http://${host}:${PROTOCOL.sttPort}`;
  }
  const host = getDevServerHost();
  return host ? `http://${host}:${PROTOCOL.sttPort}` : null;
}

export function micCompanionUrl(): string | null {
  const origin = sttOrigin();
  if (!origin) return null;
  try {
    const u = new URL(origin);
    return `https://${u.hostname}:${PROTOCOL.sttHttpsPort}/mic`;
  } catch {
    return null;
  }
}

export function sttUrl(): string | null {
  const origin = sttOrigin();
  return origin ? `${origin}/stt` : null;
}

export async function transcribeClip(audio: string, name: string): Promise<string> {
  const url = sttUrl();
  if (!url) {
    throw new Error('Brak Whisper. Na APK używane jest rozpoznawanie systemowe telefonu.');
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ audio, name }),
  });
  const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
  if (!res.ok) throw new Error(data.error || `STT HTTP ${res.status}`);
  return (data.text || '').trim();
}

export async function armCompanion(on: boolean): Promise<void> {
  const origin = sttOrigin();
  if (!origin) throw new Error('Brak adresu STT.');
  const res = await fetch(`${origin}/${on ? 'arm' : 'disarm'}`, { method: 'POST' });
  if (!res.ok) throw new Error('Nie udało się połączyć z mikrofonem-towarzyszem.');
}

export async function pullEvents(
  after: number,
): Promise<{ events: { id: number; text: string }[]; last: number }> {
  const origin = sttOrigin();
  if (!origin) return { events: [], last: after };
  const res = await fetch(`${origin}/events?after=${after}`);
  const data = (await res.json().catch(() => ({}))) as {
    events?: { id: number; text: string }[];
    last?: number;
  };
  return { events: data.events ?? [], last: data.last ?? after };
}
