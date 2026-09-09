export type Progression = {
  xp: number;
  level: number;
  levelProgress: number;
  levelTarget: number;
  multiplayerGames: number;
  multiplayerWins: number;
  soloGames: number;
  soloWins: number;
  dailyChallenges: number;
  totalPoints: number;
  bestScore: number;
};

export type ProgressionRow = {
  xp: number | string;
  level: number | string;
  level_progress: number | string;
  level_target: number | string;
  multiplayer_games: number | string;
  multiplayer_wins: number | string;
  solo_games: number | string;
  solo_wins: number | string;
  daily_challenges: number | string;
  total_points: number | string;
  best_score: number | string;
};

export type Achievement = {
  id: string;
  icon: string;
  name: string;
  description: string;
  progress: number;
  target: number;
  unlocked: boolean;
};

export const EMPTY_PROGRESSION: Progression = {
  xp: 0, level: 1, levelProgress: 0, levelTarget: 500,
  multiplayerGames: 0, multiplayerWins: 0, soloGames: 0,
  soloWins: 0, dailyChallenges: 0, totalPoints: 0, bestScore: 0,
};

export function mapProgression(row: ProgressionRow | null): Progression {
  if (!row) return EMPTY_PROGRESSION;
  return {
    xp: Number(row.xp) || 0,
    level: Number(row.level) || 1,
    levelProgress: Number(row.level_progress) || 0,
    levelTarget: Number(row.level_target) || 500,
    multiplayerGames: Number(row.multiplayer_games) || 0,
    multiplayerWins: Number(row.multiplayer_wins) || 0,
    soloGames: Number(row.solo_games) || 0,
    soloWins: Number(row.solo_wins) || 0,
    dailyChallenges: Number(row.daily_challenges) || 0,
    totalPoints: Number(row.total_points) || 0,
    bestScore: Number(row.best_score) || 0,
  };
}

export function achievementsFor(progression: Progression): Achievement[] {
  const games = progression.multiplayerGames + progression.soloGames + progression.dailyChallenges;
  const achievement = (id: string, icon: string, name: string, description: string, progress: number, target: number): Achievement => ({
    id, icon, name, description, progress: Math.min(progress, target), target, unlocked: progress >= target,
  });
  return [
    achievement('first-game', '⚡', 'First spark', 'Complete your first game', games, 1),
    achievement('champion', '🏆', 'Champion', 'Win a group game', progression.multiplayerWins, 1),
    achievement('cpu-crusher', '🤖', 'CPU crusher', 'Beat the computer', progression.soloWins, 1),
    achievement('daily-player', '☀️', 'Daily player', 'Complete a daily challenge', progression.dailyChallenges, 1),
    achievement('century', '💯', 'Century', 'Score 100 points in one game', progression.bestScore, 100),
    achievement('regular', '🔥', 'The regular', 'Complete 10 games', games, 10),
    achievement('thousand', '⭐', 'Four figures', 'Earn 1,000 total points', progression.totalPoints, 1000),
  ];
}
