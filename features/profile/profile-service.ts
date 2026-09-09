import { supabase } from '@/lib/supabase/client';
import { mapPlayerStats, type PlayerStats, type StatsRow } from '@/features/profile/profile-state';

export type { PlayerStats } from '@/features/profile/profile-state';

export type MatchHistoryItem = {
  gameResultId: string;
  roomCode: string;
  gameNumber: number;
  completedAt: string;
  score: number;
  placement: number;
  isWinner: boolean;
  playerCount: number;
  winnerName: string;
  winnerScore: number;
};

type HistoryRow = {
  game_result_id: string;
  room_code: string;
  game_number: number;
  completed_at: string;
  score: number;
  placement: number;
  is_winner: boolean;
  player_count: number;
  winner_name: string;
  winner_score: number;
};

function profileError(error: unknown): Error {
  const message = typeof error === 'object' && error && 'message' in error
    ? String(error.message).toLowerCase()
    : '';
  if (message.includes('not authenticated') || message.includes('jwt')) {
    return new Error('Your session expired. Please log in again.');
  }
  return new Error('Your game history could not be loaded. Please try again.');
}

export async function getPlayerStats(): Promise<PlayerStats> {
  const { data, error } = await supabase.rpc('get_my_game_stats').single<StatsRow>();
  if (error) throw profileError(error);
  return mapPlayerStats(data);
}

export async function getMatchHistory(limit = 20): Promise<MatchHistoryItem[]> {
  const { data, error } = await supabase.rpc('get_my_match_history', {
    requested_limit: limit,
  });
  if (error) throw profileError(error);

  return ((data ?? []) as HistoryRow[]).map((row) => ({
    gameResultId: row.game_result_id,
    roomCode: row.room_code,
    gameNumber: row.game_number,
    completedAt: row.completed_at,
    score: row.score,
    placement: row.placement,
    isWinner: row.is_winner,
    playerCount: row.player_count,
    winnerName: row.winner_name,
    winnerScore: row.winner_score,
  }));
}
