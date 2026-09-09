import { supabase } from '@/lib/supabase/client';

export type Room = {
  id: string;
  code: string;
  host_id: string;
  status: 'lobby' | 'playing' | 'ended';
  max_rounds: number;
  time_per_round: number;
  current_round: number;
  current_round_id: string | null;
  game_number: number;
  started_at: string | null;
};

export type Player = {
  id: string;
  room_id: string;
  user_id: string | null;
  display_name: string;
  is_host: boolean;
  total_score: number;
};

export type Round = {
  id: string;
  room_id: string;
  round_number: number;
  letter: string;
  status: 'active' | 'submitted' | 'ended';
  started_at: string;
  ended_at: string | null;
};

export type AnswerValues = { name: string; animal: string; place: string; thing: string };

export type GameAnswer = AnswerValues & {
  id: string;
  player_id: string;
  player_name: string;
  name_valid: boolean | null;
  animal_valid: boolean | null;
  place_valid: boolean | null;
  thing_valid: boolean | null;
  points_earned: number;
};

export const EMPTY_ANSWERS: AnswerValues = { name: '', animal: '', place: '', thing: '' };
export const CATEGORIES: Array<keyof AnswerValues> = ['name', 'animal', 'place', 'thing'];

export async function getPlayer(roomId: string, userId: string) {
  const { data, error } = await supabase
    .from('players')
    .select('*')
    .eq('room_id', roomId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data as Player | null;
}
