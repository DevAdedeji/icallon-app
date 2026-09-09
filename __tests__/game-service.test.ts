import { applyAnswerScore, remainingRoundSeconds } from '@/features/game/game-state';
import type { GameAnswer } from '@/lib/game';

const answer: GameAnswer = {
  id: 'answer-1',
  player_id: 'player-1',
  player_name: 'Ada',
  name: 'Alice',
  animal: 'Ant',
  place: 'Athens',
  thing: 'Anchor',
  name_valid: false,
  animal_valid: false,
  place_valid: false,
  thing_valid: false,
  points_earned: 0,
};

describe('game state helpers', () => {
  it('derives a device-independent round countdown', () => {
    expect(remainingRoundSeconds('2026-01-01T00:00:00.000Z', 60, Date.parse('2026-01-01T00:00:10.100Z'))).toBe(50);
    expect(remainingRoundSeconds('2026-01-01T00:00:00.000Z', 60, Date.parse('2026-01-01T00:01:01.000Z'))).toBe(0);
  });

  it('applies the score returned by the database to optimistic review state', () => {
    expect(applyAnswerScore(answer, 'animal', true, 10)).toMatchObject({
      animal_valid: true,
      points_earned: 10,
    });
  });
});
