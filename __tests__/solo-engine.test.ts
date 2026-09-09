import { computerAnswers, scoreSoloRound, soloLetters } from '@/features/solo/solo-engine';

describe('solo game engine', () => {
  it('creates a repeatable three-letter game from a seed', () => {
    expect(soloLetters('classic', 'same-seed')).toEqual(soloLetters('classic', 'same-seed'));
    expect(new Set(soloLetters('classic', 'same-seed')).size).toBe(3);
  });

  it('scales the number of computer answers with difficulty', () => {
    const filled = (answers: ReturnType<typeof computerAnswers>) => Object.values(answers).filter(Boolean).length;
    expect(filled(computerAnswers('food', 'A', 'easy', 'seed'))).toBe(2);
    expect(filled(computerAnswers('food', 'A', 'medium', 'seed'))).toBe(3);
    expect(filled(computerAnswers('food', 'A', 'hard', 'seed'))).toBe(4);
  });

  it('awards 10 for unique, 5 for matching, and zero for wrong-letter answers', () => {
    const score = scoreSoloRound(
      { name: 'Alice', animal: 'Antelope', place: 'London', thing: '' },
      { name: 'Amara', animal: 'Antelope', place: 'Accra', thing: 'Anchor' },
      'A',
    );
    expect(score.playerCategoryPoints).toEqual({ name: 10, animal: 5, place: 0, thing: 0 });
    expect(score.opponentCategoryPoints).toEqual({ name: 10, animal: 5, place: 10, thing: 10 });
    expect(score.playerPoints).toBe(15);
    expect(score.opponentPoints).toBe(35);
  });
});
