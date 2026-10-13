import { Buffer } from 'buffer';
import type { MicClip } from './types';

export type MicSession = { stop: () => Promise<MicClip> };

function mediaDevices(): MediaDevices | undefined {
  return (globalThis as { navigator?: Navigator }).navigator?.mediaDevices;
}

function MediaRecorderCtor(): typeof MediaRecorder | undefined {
  return (globalThis as { MediaRecorder?: typeof MediaRecorder }).MediaRecorder;
}

function AudioContextCtor(): (new () => AudioContext) | undefined {
  const g = globalThis as {
    AudioContext?: new () => AudioContext;
    webkitAudioContext?: new () => AudioContext;
  };
  return g.AudioContext || g.webkitAudioContext;
}

function toB64(bytes: Uint8Array | ArrayBuffer): string {
  return Buffer.from(bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes).toString('base64');
}

function mergePcm(parts: Float32Array[]): Float32Array {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Float32Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function encodeWav(samples: Float32Array, sampleRate: number): string {
  const bytes = samples.length * 2;
  const buf = new ArrayBuffer(44 + bytes);
  const v = new DataView(buf);
  const ascii = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i += 1) v.setUint8(offset + i, s.charCodeAt(i));
  };
  ascii(0, 'RIFF');
  v.setUint32(4, 36 + bytes, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  ascii(36, 'data');
  v.setUint32(40, bytes, true);
  let p = 44;
  for (let i = 0; i < samples.length; i += 1, p += 2) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    v.setInt16(p, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return toB64(buf);
}

/** Standardowy mikrofon: zgoda → PCM/webm + opcjonalny pasek poziomu. */
export async function startMic(opts?: {
  onLevel?: (level01: number) => void;
}): Promise<MicSession> {
  const md = mediaDevices();
  if (!md?.getUserMedia) {
    throw new Error('To środowisko nie udostępnia mikrofonu (brak getUserMedia).');
  }
  const stream = await md.getUserMedia({ audio: { channelCount: 1, echoCancellation: true } });
  const Ctx = AudioContextCtor();

  let meterTimer: ReturnType<typeof setInterval> | null = null;
  let meterCtx: AudioContext | null = null;

  const attachMeter = (ctx: AudioContext) => {
    if (!opts?.onLevel) return;
    try {
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      meterTimer = setInterval(() => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        opts.onLevel?.(Math.max(0, Math.min(1, Math.sqrt(sum / data.length) * 4)));
      }, 100);
    } catch {
      /* ignore */
    }
  };

  const clearMeter = async () => {
    if (meterTimer) {
      clearInterval(meterTimer);
      meterTimer = null;
    }
    if (meterCtx) {
      await meterCtx.close().catch(() => undefined);
      meterCtx = null;
    }
  };

  const Rec = MediaRecorderCtor();
  if (Rec) {
    if (Ctx && opts?.onLevel) {
      try {
        meterCtx = new Ctx();
        attachMeter(meterCtx);
      } catch {
        /* ignore */
      }
    }
    const mime = Rec.isTypeSupported?.('audio/webm')
      ? 'audio/webm'
      : Rec.isTypeSupported?.('audio/mp4')
        ? 'audio/mp4'
        : '';
    const rec = mime ? new Rec(stream, { mimeType: mime }) : new Rec(stream);
    const chunks: Blob[] = [];
    rec.ondataavailable = (ev) => {
      if (ev.data.size) chunks.push(ev.data);
    };
    rec.start(200);
    return {
      async stop() {
        const blob: Blob = await new Promise((resolve, reject) => {
          rec.onerror = () => reject(new Error('Nagrywanie przerwane.'));
          rec.onstop = () => resolve(new Blob(chunks, { type: rec.mimeType || 'audio/webm' }));
          rec.stop();
        });
        await clearMeter();
        stream.getTracks().forEach((t) => t.stop());
        const ext = blob.type.includes('mp4') ? 'm4a' : 'webm';
        return { audio: toB64(await blob.arrayBuffer()), name: `speech.${ext}` };
      },
    };
  }

  if (!Ctx) {
    stream.getTracks().forEach((t) => t.stop());
    throw new Error('To środowisko nie udostępnia mikrofonu (brak AudioContext).');
  }
  const ctx = new Ctx();
  const src = ctx.createMediaStreamSource(stream);
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  const mute = ctx.createGain();
  mute.gain.value = 0;
  const pcm: Float32Array[] = [];
  proc.onaudioprocess = (ev) => {
    const ch = ev.inputBuffer.getChannelData(0);
    pcm.push(new Float32Array(ch));
    if (opts?.onLevel) {
      let sum = 0;
      for (let i = 0; i < ch.length; i++) sum += ch[i] * ch[i];
      opts.onLevel(Math.max(0, Math.min(1, Math.sqrt(sum / ch.length) * 4)));
    }
  };
  src.connect(proc);
  proc.connect(mute);
  mute.connect(ctx.destination);
  return {
    async stop() {
      proc.disconnect();
      src.disconnect();
      mute.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      const rate = ctx.sampleRate || 16000;
      await ctx.close().catch(() => undefined);
      return { audio: encodeWav(mergePcm(pcm), rate), name: 'speech.wav' };
    },
  };
}
