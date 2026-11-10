/**
 * Mapowanie tekstu Vosk → akcja robota.
 * jazda ciągła aż do „stop”; szczeka; podążaj za opaskami.
 */

export type VoiceAction =
  | { kind: 'drive'; vx: number; vy: number; omega: number; label: string }
  | { kind: 'stop'; label: string }
  | { kind: 'bark'; label: string }
  | { kind: 'follow'; enabled: boolean; label: string }
  | { kind: 'unknown'; label: string };

const SPEED = 0.55;
const TURN = 0.5;

/** PL → ASCII (ł/ą/…), żeby Vosk „daj głos” nie stawało się „daj g os”. */
function norm(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/ł/g, 'l')
    .replace(/ą/g, 'a')
    .replace(/ę/g, 'e')
    .replace(/ć/g, 'c')
    .replace(/ń/g, 'n')
    .replace(/ó/g, 'o')
    .replace(/ś/g, 's')
    .replace(/ź|ż/g, 'z')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Frazy gramatyczne pod Vosk (PL) — warianty bez/z diakrytykami. */
export const VOICE_GRAMMAR = [
  'stop',
  'stój',
  'stoj',
  'halt',
  'do przodu',
  'przód',
  'przod',
  'jedź',
  'jedz',
  'idź',
  'idz',
  'do tyłu',
  'do tylu',
  'tył',
  'tyl',
  'w lewo',
  'lewo',
  'w prawo',
  'prawo',
  'szczekaj',
  'szczeka',
  'szczek',
  'daj głos',
  'daj glos',
  'głos',
  'glos',
  'hau',
  'bark',
  'podążaj za mną',
  'podazaj za mna',
  'podążaj',
  'podazaj',
  'za mną',
  'za mna',
  'opaski',
  'śledź',
  'sledz',
  'manual',
  'ręcznie',
  'recznie',
  '[unk]',
];

export function parseVoiceCommand(raw: string): VoiceAction {
  const t = norm(raw);
  if (!t || t === 'unk') return { kind: 'unknown', label: raw };

  if (/\b(stop|stoj|halt|wystarczy|koniec)\b/.test(t) || t === 'stop' || t === 'stoj') {
    return { kind: 'stop', label: 'STOP' };
  }

  // „daj głos” / szczek — przed jazdą (żeby „idź” nie kolidowało).
  if (
    /szczek/.test(t) ||
    /\b(bark|hau|glos)\b/.test(t) ||
    t.includes('daj glos') ||
    t.includes('daj gl')
  ) {
    return { kind: 'bark', label: 'szczekaj' };
  }

  if (
    /\b(podazaj|sledz|follow|opask)\b/.test(t) ||
    t.includes('za mna')
  ) {
    return { kind: 'follow', enabled: true, label: 'podążaj za opaskami' };
  }

  if (/\b(manual|recznie|reczny)\b/.test(t)) {
    return { kind: 'follow', enabled: false, label: 'tryb ręczny' };
  }

  if (/\b(tyl|tylu|cofnij|wstecz)\b/.test(t)) {
    return { kind: 'drive', vx: 0, vy: -SPEED, omega: 0, label: 'do tyłu' };
  }

  if (/\b(przod|przodu|jedz|idz|naprzod)\b/.test(t)) {
    return { kind: 'drive', vx: 0, vy: SPEED, omega: 0, label: 'do przodu' };
  }

  if (/\b(lewo)\b/.test(t)) {
    return { kind: 'drive', vx: 0, vy: 0, omega: TURN, label: 'w lewo' };
  }

  if (/\b(prawo)\b/.test(t)) {
    return { kind: 'drive', vx: 0, vy: 0, omega: -TURN, label: 'w prawo' };
  }

  return { kind: 'unknown', label: raw };
}
