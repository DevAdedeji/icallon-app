import { supabase } from '@/lib/supabase/client';
import type { SoloDifficulty } from '@/features/solo/solo-engine';

export async function recordSoloResult(input: {
  resultId: string;
  difficulty: SoloDifficulty;
  categoryPack: string;
  playerScore: number;
  opponentScore: number;
}): Promise<void> {
  const { error } = await supabase.rpc('record_solo_result', {
    requested_result_id: input.resultId,
    requested_mode: 'solo',
    requested_difficulty: input.difficulty,
    requested_category_pack: input.categoryPack,
    requested_player_score: input.playerScore,
    requested_opponent_score: input.opponentScore,
    requested_challenge_date: null,
  });
  if (error) throw new Error('Your result could not be saved. Please try again.');
}
