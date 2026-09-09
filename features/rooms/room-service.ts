import { supabase } from '@/lib/supabase/client';
import { roomCodeSchema, roomSettingsSchema, type RoomSettings } from '@/features/rooms/room-validation';

export type RoomSession = {
  roomId: string;
  roomCode: string;
  isHost: boolean;
};

export type ActiveRoomSession = RoomSession & {
  status: 'lobby' | 'playing';
  currentRound: number;
  currentRoundId: string | null;
};

type CreateRoomRow = {
  room_id: string;
  room_code: string;
};

type JoinRoomRow = CreateRoomRow & {
  is_host: boolean;
};

type ActiveRoomRow = {
  room_id: string;
  room_code: string;
  room_status: 'lobby' | 'playing';
  is_host: boolean;
  current_round: number;
  current_round_id: string | null;
};

function roomError(error: unknown): Error {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'object' && error && 'message' in error
      ? String(error.message)
      : '';
  const normalized = message.toLowerCase();

  if (normalized.includes('not authenticated') || normalized.includes('jwt')) {
    return new Error('Your session expired. Please log in again.');
  }
  if (normalized.includes('profile')) {
    return new Error('Your player profile is unavailable. Please log out and sign in again.');
  }
  if (normalized.includes('not found')) {
    return new Error('Room not found. Check the code and try again.');
  }
  if (normalized.includes('ended')) {
    return new Error('This room has already ended.');
  }
  return new Error('The room could not be updated. Please try again.');
}

export async function createRoomSession(settings: RoomSettings): Promise<RoomSession> {
  const validated = roomSettingsSchema.parse(settings);
  const { data, error } = await supabase
    .rpc('create_game_room', {
      requested_max_rounds: validated.maxRounds,
      requested_time_per_round: validated.timePerRound,
    })
    .single<CreateRoomRow>();

  if (error) throw roomError(error);
  if (!data?.room_id || !data.room_code) throw new Error('The room was created without a valid session.');
  return { roomId: data.room_id, roomCode: data.room_code, isHost: true };
}

export async function joinRoomSession(code: string): Promise<RoomSession> {
  const roomCode = roomCodeSchema.parse(code);
  const { data, error } = await supabase
    .rpc('join_game_room', { requested_room_code: roomCode })
    .single<JoinRoomRow>();

  if (error) throw roomError(error);
  if (!data?.room_id || !data.room_code) throw new Error('The room was joined without a valid session.');
  return { roomId: data.room_id, roomCode: data.room_code, isHost: data.is_host };
}

export async function getActiveRoomSession(): Promise<ActiveRoomSession | null> {
  const { data, error } = await supabase.rpc('get_my_active_room').maybeSingle<ActiveRoomRow>();
  if (error) throw roomError(error);
  if (!data) return null;
  return {
    roomId: data.room_id,
    roomCode: data.room_code,
    isHost: data.is_host,
    status: data.room_status,
    currentRound: data.current_round,
    currentRoundId: data.current_round_id,
  };
}

export async function setRoomPresence(roomId: string, connected: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_room_presence', {
    requested_room_id: roomId,
    requested_connected: connected,
  });
  if (error) throw roomError(error);
}
