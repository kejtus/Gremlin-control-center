import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { Buffer } from 'buffer';
import type { MicClip } from './types';

export type NativeMicSession = {
  stop: () => Promise<MicClip & { uri: string }>;
};

export function nativeRecordAvailable(): boolean {
  if (Platform.OS === 'web') return false;
  try {
    return requireOptionalNativeModule('ExpoAudio') != null;
  } catch {
    return false;
  }
}

/**
 * Nagrywanie pod STT: mono AAC/m4a @ 16 kHz (Whisper + OS file STT).
 */
export async function startNativeRecord(
  onMeter?: (db: number) => void,
): Promise<NativeMicSession> {
  if (!nativeRecordAvailable()) {
    throw new Error('Nagrywanie natywne jest w zainstalowanym APK.');
  }

  const audio = await import('expo-audio');
  const perm = await audio.requestRecordingPermissionsAsync();
  if (!perm.granted) {
    throw new Error('Brak zgody na mikrofon.');
  }

  await audio.setAudioModeAsync({
    allowsRecording: true,
    playsInSilentMode: true,
    interruptionMode: 'doNotMix',
  });

  // 16 kHz mono — lepsze dla mowy; unikamy stereo HQ które psuje ffmpeg.
  const platformOpts =
    Platform.OS === 'ios'
      ? {
          extension: '.wav',
          sampleRate: 16000,
          numberOfChannels: 1,
          bitRate: 64000,
          isMeteringEnabled: true,
          outputFormat: 'lpcm',
          audioQuality: 0x60,
          linearPCMBitDepth: 16,
          linearPCMIsBigEndian: false,
          linearPCMIsFloat: false,
        }
      : Platform.OS === 'android'
        ? {
            extension: '.m4a',
            sampleRate: 16000,
            numberOfChannels: 1,
            bitRate: 64000,
            isMeteringEnabled: true,
            outputFormat: 'mpeg4',
            audioEncoder: 'aac',
          }
        : {
            extension: '.webm',
            sampleRate: 16000,
            numberOfChannels: 1,
            bitRate: 64000,
            isMeteringEnabled: true,
            mimeType: 'audio/webm',
            bitsPerSecond: 64000,
          };

  const recorder = new audio.AudioModule.AudioRecorder(platformOpts);
  await recorder.prepareToRecordAsync();
  recorder.record();

  let meterTimer: ReturnType<typeof setInterval> | null = null;
  if (onMeter) {
    meterTimer = setInterval(() => {
      try {
        const st = recorder.getStatus();
        if (typeof st.metering === 'number') onMeter(st.metering);
      } catch {
        /* ignore */
      }
    }, 120);
  }

  return {
    async stop() {
      if (meterTimer) {
        clearInterval(meterTimer);
        meterTimer = null;
      }
      await recorder.stop();
      // Domknięcie muxera — krótkie; nie wymuszamy 2 s mowy.
      await new Promise((r) => setTimeout(r, 40));
      try {
        await audio.setAudioModeAsync({
          allowsRecording: false,
          playsInSilentMode: true,
          interruptionMode: 'mixWithOthers',
        });
      } catch {
        /* ignore */
      }
      const uri = recorder.uri;
      if (!uri) throw new Error('Nie zapisano nagrania.');

      const res = await fetch(uri);
      const buf = await res.arrayBuffer();
      if (buf.byteLength < 64) {
        throw new Error('Nagranie puste — sprawdź mikrofon i spróbuj ponownie.');
      }
      const name = uri.split('/').pop() || (Platform.OS === 'ios' ? 'speech.wav' : 'speech.m4a');
      return {
        uri,
        name,
        audio: Buffer.from(buf).toString('base64'),
      };
    },
  };
}
