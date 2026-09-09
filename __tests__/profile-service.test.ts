import { EMPTY_PLAYER_STATS, mapPlayerStats } from '@/features/profile/profile-state';

describe('profile history mapping', () => {
  it('returns an intentional empty state before the first completed game', () => {
    expect(mapPlayerStats(null)).toEqual(EMPTY_PLAYER_STATS);
  });

  it('normalizes PostgreSQL bigint values into display-safe numbers', () => {
    expect(mapPlayerStats({
      games_played: '4',
      wins: '2',
      total_points: '310',
      best_score: 120,
      current_win_streak: '1',
    })).toEqual({
      gamesPlayed: 4,
      wins: 2,
      totalPoints: 310,
      bestScore: 120,
      currentWinStreak: 1,
    });
  });
});
