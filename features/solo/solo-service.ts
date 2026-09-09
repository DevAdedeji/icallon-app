import { supabase } from '@/lib/supabase/client';
import type { SoloDifficulty } from '@/features/solo/solo-engine';

export type DailyChallenge = {
  challengeDate: string;
  categoryPack: 'classic' | 'world' | 'food' | 'entertainment';
  seed: string;
  completed: boolean;
  playerScore: number | null;
  opponentScore: number | null;
};

type DailyChallengeRow = {
  challenge_date: string;
  category_pack: DailyChallenge['categoryPack'];
  seed: string;
  completed: boolean;
  player_score: number | null;
  opponent_score: number | null;
};

export async function recordSoloResult(input: {
  resultId: string;
  difficulty: SoloDifficulty;
  categoryPack: string;
  playerScore: number;
  opponentScore: number;
  mode?: 'solo' | 'daily';
  challengeDate?: string | null;
}): Promise<void> {
  const { error } = await supabase.rpc('record_solo_result', {
    requested_result_id: input.resultId,
    requested_mode: input.mode ?? 'solo',
    requested_difficulty: input.difficulty,
    requested_category_pack: input.categoryPack,
    requested_player_score: input.playerScore,
    requested_opponent_score: input.opponentScore,
    requested_challenge_date: input.challengeDate ?? null,
  });
  if (error) throw new Error('Your result could not be saved. Please try again.');
}

export async function getDailyChallenge(): Promise<DailyChallenge> {
  const { data, error } = await supabase.rpc('get_daily_challenge').single<DailyChallengeRow>();
  if (error || !data) throw new Error('Today’s challenge could not be loaded. Please try again.');
  return {
    challengeDate: data.challenge_date,
    categoryPack: data.category_pack,
    seed: data.seed,
    completed: data.completed,
    playerScore: data.player_score,
    opponentScore: data.opponent_score,
  };
}
