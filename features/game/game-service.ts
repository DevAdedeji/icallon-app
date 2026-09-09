import { supabase } from '@/lib/supabase/client';
import type { AnswerValues, Round } from '@/lib/game';

type AnswerCategory = keyof AnswerValues;

type StartedRound = Pick<Round, 'id' | 'round_number' | 'letter' | 'started_at'> & {
  status: 'active';
};

function gameError(error: unknown): Error {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'object' && error && 'message' in error
      ? String(error.message)
      : '';
  const normalized = message.toLowerCase();

  if (normalized.includes('not authenticated') || normalized.includes('jwt')) {
    return new Error('Your session expired. Please log in again.');
  }
  if (normalized.includes('only the host')) return new Error('Only the room host can do that.');
  if (normalized.includes('already been submitted')) return new Error('Your answers were already submitted.');
  if (normalized.includes('not accepting')) return new Error('This round is no longer accepting answers.');
  if (normalized.includes('finish the current round')) return new Error('Finish the current round first.');
  if (normalized.includes('complete')) return new Error('All rounds are complete.');
  return new Error('The game could not be updated. Please try again.');
}

async function run(command: PromiseLike<{ error: unknown }>): Promise<void> {
  const { error } = await command;
  if (error) throw gameError(error);
}

export async function startGame(roomId: string): Promise<void> {
  await run(supabase.rpc('start_game', { requested_room_id: roomId }));
}

export async function startRound(roomId: string, selectedLetter: string): Promise<StartedRound> {
  const letter = selectedLetter.trim().toUpperCase();
  if (!/^[A-Z]$/.test(letter)) throw new Error('Choose one letter from A to Z.');

  const { data, error } = await supabase
    .rpc('start_game_round', { requested_room_id: roomId, requested_letter: letter })
    .single<{ round_id: string; round_number: number; letter: string; started_at: string }>();
  if (error) throw gameError(error);
  if (!data) throw new Error('The round started without valid game state.');
  return { id: data.round_id, round_number: data.round_number, letter: data.letter, started_at: data.started_at, status: 'active' };
}

export async function saveGameAnswers(
  roomId: string,
  roundId: string,
  values: AnswerValues,
  submit = false,
): Promise<void> {
  await run(supabase.rpc('save_game_answers', {
    requested_room_id: roomId,
    requested_round_id: roundId,
    requested_name: values.name,
    requested_animal: values.animal,
    requested_place: values.place,
    requested_thing: values.thing,
    requested_submit: submit,
  }));
}

export async function closeSubmissions(roundId: string): Promise<void> {
  await run(supabase.rpc('close_game_submissions', { requested_round_id: roundId }));
}

export async function scoreAnswer(
  answerId: string,
  category: AnswerCategory,
  valid: boolean,
): Promise<number> {
  const { data, error } = await supabase
    .rpc('score_game_answer', {
      requested_answer_id: answerId,
      requested_category: category,
      requested_valid: valid,
    })
    .single<{ points_earned: number }>();
  if (error) throw gameError(error);
  if (!data) throw new Error('The answer score could not be confirmed.');
  return data.points_earned;
}

export async function confirmRound(roundId: string): Promise<void> {
  await run(supabase.rpc('confirm_game_round', { requested_round_id: roundId }));
}

export async function endGame(roomId: string): Promise<void> {
  await run(supabase.rpc('end_game', { requested_room_id: roomId }));
}

export async function requestRematch(roomId: string): Promise<void> {
  await run(supabase.rpc('request_game_rematch', { requested_room_id: roomId }));
}
