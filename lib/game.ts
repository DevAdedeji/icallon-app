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

export function createId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

export function answerPoints(answer: Pick<GameAnswer, 'name_valid' | 'animal_valid' | 'place_valid' | 'thing_valid'>) {
  return CATEGORIES.reduce((total, category) => total + (answer[`${category}_valid` as keyof typeof answer] ? 10 : 0), 0);
}

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

export async function saveAnswers({
  roomId,
  roundId,
  player,
  values,
  submitted = false,
}: {
  roomId: string;
  roundId: string;
  player: Player;
  values: AnswerValues;
  submitted?: boolean;
}) {
  const { data: existing, error: findError } = await supabase
    .from('answers')
    .select('id')
    .eq('room_id', roomId)
    .eq('round_id', roundId)
    .eq('player_id', player.id)
    .maybeSingle();
  if (findError) throw findError;

  const payload = {
    ...values,
    updated_at: new Date().toISOString(),
    ...(submitted ? { submitted_at: new Date().toISOString() } : {}),
  };
  const request = existing
    ? supabase.from('answers').update(payload).eq('id', existing.id)
    : supabase.from('answers').insert({
        id: createId(), room_id: roomId, round_id: roundId, player_id: player.id,
        player_name: player.display_name, ...payload,
      });
  const { error } = await request;
  if (error) throw error;
}
