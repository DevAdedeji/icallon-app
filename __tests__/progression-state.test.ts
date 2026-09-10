import { achievementsFor, mapProgression } from '@/features/profile/progression-state';

describe('player progression', () => {
  it('maps database numbers and derives achievement progress', () => {
    const progression = mapProgression({ xp: '650', level: 2, level_progress: '150', level_target: 500, multiplayer_games: '2', multiplayer_wins: 1, solo_games: 1, solo_wins: 1, daily_challenges: 1, total_points: '320', best_score: 110 });
    expect(progression).toMatchObject({ xp: 650, level: 2, levelProgress: 150, multiplayerGames: 2 });
    const achievements = achievementsFor(progression);
    expect(achievements.find((item) => item.id === 'champion')?.unlocked).toBe(true);
    expect(achievements.find((item) => item.id === 'century')?.unlocked).toBe(true);
    expect(achievements.find((item) => item.id === 'regular')).toMatchObject({ progress: 2, target: 10, unlocked: false });
    expect(achievements.some((item) => item.id === 'cpu-crusher' || item.id === 'daily-player')).toBe(false);
  });
});
