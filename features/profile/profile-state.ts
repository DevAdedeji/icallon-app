export type PlayerStats = {
  gamesPlayed: number;
  wins: number;
  totalPoints: number;
  bestScore: number;
  currentWinStreak: number;
};

export type StatsRow = {
  games_played: number | string;
  wins: number | string;
  total_points: number | string;
  best_score: number | string;
  current_win_streak: number | string;
};

export const EMPTY_PLAYER_STATS: PlayerStats = {
  gamesPlayed: 0,
  wins: 0,
  totalPoints: 0,
  bestScore: 0,
  currentWinStreak: 0,
};

export function mapPlayerStats(row: StatsRow | null): PlayerStats {
  if (!row) return EMPTY_PLAYER_STATS;
  return {
    gamesPlayed: Number(row.games_played) || 0,
    wins: Number(row.wins) || 0,
    totalPoints: Number(row.total_points) || 0,
    bestScore: Number(row.best_score) || 0,
    currentWinStreak: Number(row.current_win_streak) || 0,
  };
}
