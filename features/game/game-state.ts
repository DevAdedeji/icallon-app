import type { AnswerValues, GameAnswer } from '@/lib/game';

export function applyAnswerScore(
  answer: GameAnswer,
  category: keyof AnswerValues,
  valid: boolean,
  pointsEarned: number,
): GameAnswer {
  return { ...answer, [`${category}_valid`]: valid, points_earned: pointsEarned };
}

export function databaseTimestampMs(timestamp: string): number {
  const match = timestamp.match(
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|([+-])(\d{2}):?(\d{2}))?$/,
  );

  if (!match) return Date.parse(timestamp);

  const [, year, month, day, hour, minute, second, fraction = '', zone, sign, offsetHour = '0', offsetMinute = '0'] = match;
  const milliseconds = Number(fraction.padEnd(3, '0').slice(0, 3));
  const localTime = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    milliseconds,
  );
  // The existing schema stores timestamps without a zone, but PostgreSQL's
  // now() value is UTC in this project. Treat zone-less API values as UTC.
  if (!zone || zone === 'Z') return localTime;

  const offset = (Number(offsetHour) * 60 + Number(offsetMinute)) * 60_000;
  return sign === '+' ? localTime - offset : localTime + offset;
}

export function remainingRoundSeconds(startedAt: string, durationSeconds: number, now = Date.now()): number {
  const finishAt = databaseTimestampMs(startedAt) + durationSeconds * 1000;
  if (!Number.isFinite(finishAt)) return 0;
  return Math.max(0, Math.ceil((finishAt - now) / 1000));
}

export function duplicateAnswerKeys(answers: GameAnswer[]): Set<string> {
  const occurrences = new Map<string, string[]>();

  for (const answer of answers) {
    for (const category of ['name', 'animal', 'place', 'thing'] as const) {
      if (answer[`${category}_valid`] !== true) continue;
      const normalized = answer[category].trim().replace(/\s+/g, ' ').toLocaleLowerCase();
      if (!normalized) continue;
      const key = `${category}:${normalized}`;
      occurrences.set(key, [...(occurrences.get(key) ?? []), answer.id]);
    }
  }

  const duplicates = new Set<string>();
  for (const [valueKey, answerIds] of occurrences) {
    if (answerIds.length < 2) continue;
    const category = valueKey.slice(0, valueKey.indexOf(':'));
    for (const answerId of answerIds) duplicates.add(`${answerId}:${category}`);
  }
  return duplicates;
}
