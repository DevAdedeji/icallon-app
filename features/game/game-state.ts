import type { AnswerValues, GameAnswer } from '@/lib/game';

export function applyAnswerScore(
  answer: GameAnswer,
  category: keyof AnswerValues,
  valid: boolean,
  pointsEarned: number,
): GameAnswer {
  return { ...answer, [`${category}_valid`]: valid, points_earned: pointsEarned };
}

export function remainingRoundSeconds(startedAt: string, durationSeconds: number, now = Date.now()): number {
  const finishAt = new Date(startedAt).getTime() + durationSeconds * 1000;
  if (!Number.isFinite(finishAt)) return 0;
  return Math.max(0, Math.ceil((finishAt - now) / 1000));
}
