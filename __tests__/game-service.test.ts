import { applyAnswerScore, databaseTimestampMs, duplicateAnswerKeys, remainingRoundSeconds } from '@/features/game/game-state';
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

  it('parses PostgreSQL microsecond timestamps consistently across JavaScript runtimes', () => {
    expect(databaseTimestampMs('2026-09-09T04:47:59.007323')).toBe(Date.UTC(2026, 8, 9, 4, 47, 59, 7));
    expect(databaseTimestampMs('2026-09-09T04:47:59.007323+00:00')).toBe(Date.UTC(2026, 8, 9, 4, 47, 59, 7));
    expect(databaseTimestampMs('2026-09-09 06:47:59.007323+02:00')).toBe(Date.UTC(2026, 8, 9, 4, 47, 59, 7));
    expect(databaseTimestampMs('2026-09-08T23:47:59.007323-05:00')).toBe(Date.UTC(2026, 8, 9, 4, 47, 59, 7));
  });

  it('counts down from PostgreSQL timestamps with microsecond precision', () => {
    expect(remainingRoundSeconds(
      '2026-09-09T04:47:59.007323+00:00',
      120,
      Date.UTC(2026, 8, 9, 4, 48, 9, 108),
    )).toBe(110);
  });

  it('applies the score returned by the database to optimistic review state', () => {
    expect(applyAnswerScore(answer, 'animal', true, 10)).toMatchObject({
      animal_valid: true,
      points_earned: 10,
    });
  });

  it('finds valid duplicates without being affected by case or extra spaces', () => {
    const second: GameAnswer = {
      ...answer,
      id: 'answer-2',
      player_id: 'player-2',
      player_name: 'Bola',
      animal: '  ANT ',
      animal_valid: true,
    };
    const first = { ...answer, animal_valid: true };

    expect(duplicateAnswerKeys([first, second])).toEqual(new Set([
      'answer-1:animal',
      'answer-2:animal',
    ]));
  });

  it('does not mark rejected matching answers as duplicates', () => {
    const rejected = { ...answer, id: 'answer-2', animal_valid: false };
    const accepted = { ...answer, animal_valid: true };
    expect(duplicateAnswerKeys([accepted, rejected])).toEqual(new Set());
  });
});
