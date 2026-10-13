import { Buffer } from 'buffer';
import { Platform } from 'react-native';

const MAX_BYTES = 3 * 1024 * 1024;

export type PickedMp3 = {
  name: string;
  base64: string;
  bytes: number;
};

function safeName(raw: string): string {
  const base = (raw || 'upload.mp3').split(/[/\\]/).pop() || 'upload.mp3';
  const cleaned = base.replace(/[^\w.\-()+ ]+/g, '_').trim() || 'upload.mp3';
  return /\.mp3$/i.test(cleaned) ? cleaned : `${cleaned}.mp3`;
}

function fromArrayBuffer(name: string, buf: ArrayBuffer): PickedMp3 {
  if (buf.byteLength > MAX_BYTES) {
    throw new Error(`Plik za duży (max ${Math.round(MAX_BYTES / 1024 / 1024)} MB).`);
  }
  if (buf.byteLength < 64) {
    throw new Error('Plik wygląda na pusty.');
  }
  return {
    name: safeName(name),
    base64: Buffer.from(buf).toString('base64'),
    bytes: buf.byteLength,
  };
}

function pickWeb(): Promise<PickedMp3 | null> {
  return new Promise((resolve, reject) => {
    const doc = (globalThis as { document?: Document }).document;
    if (!doc) {
      reject(new Error('Wybór pliku niedostępny.'));
      return;
    }
    const input = doc.createElement('input');
    input.type = 'file';
    input.accept = 'audio/mpeg,audio/mp3,.mp3';
    input.style.display = 'none';
    input.onchange = () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) {
        resolve(null);
        return;
      }
      void file
        .arrayBuffer()
        .then((buf) => resolve(fromArrayBuffer(file.name, buf)))
        .catch((err) => reject(err instanceof Error ? err : new Error('Nie udało się odczytać pliku.')));
    };
    input.oncancel = () => {
      input.remove();
      resolve(null);
    };
    doc.body.appendChild(input);
    input.click();
  });
}

async function pickNative(): Promise<PickedMp3 | null> {
  const DocumentPicker = await import('expo-document-picker');
  const res = await DocumentPicker.getDocumentAsync({
    type: ['audio/mpeg', 'audio/mp3', 'audio/*'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (res.canceled || !res.assets?.[0]) return null;
  const asset = res.assets[0];
  const response = await fetch(asset.uri);
  if (!response.ok) throw new Error('Nie udało się odczytać wybranego pliku.');
  const buf = await response.arrayBuffer();
  return fromArrayBuffer(asset.name || 'upload.mp3', buf);
}

/** Wybór MP3 z telefonu / PC (web: `<input type=file>`). */
export async function pickMp3(): Promise<PickedMp3 | null> {
  if (Platform.OS === 'web') return pickWeb();
  return pickNative();
}
