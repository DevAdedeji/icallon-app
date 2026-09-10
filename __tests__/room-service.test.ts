jest.mock('@/lib/supabase/client', () => ({ supabase: { rpc: jest.fn() } }));

import {
  createPublicMatchRoom,
  joinPublicMatchRoom,
  joinPublicMatchmaking,
  listPublicMatchRooms,
} from '@/features/rooms/room-service';
import { supabase } from '@/lib/supabase/client';

const mockRpc = supabase.rpc as jest.Mock;

describe('public matchmaking service', () => {
  beforeEach(() => mockRpc.mockReset());

  it('maps an allocated public room', async () => {
    mockRpc.mockReturnValue({ single: () => Promise.resolve({ data: { room_id: 'room-1', room_code: 'ABC234', is_host: false, matched_existing: true }, error: null }) });
    await expect(joinPublicMatchmaking('classic')).resolves.toEqual({ roomId: 'room-1', roomCode: 'ABC234', isHost: false, matchedExisting: true });
  });

  it('maps the visible public room browser', async () => {
    mockRpc.mockResolvedValue({
      data: [{
        room_id: 'room-1', room_code: 'ABC234', category_pack: 'classic',
        host_name: 'Ada', player_count: 2, max_players: 4,
        created_at: '2026-09-09T12:00:00Z',
      }],
      error: null,
    });
    await expect(listPublicMatchRooms('classic')).resolves.toEqual([{
      roomId: 'room-1', roomCode: 'ABC234', categoryPack: 'classic',
      hostName: 'Ada', playerCount: 2, maxPlayers: 4,
      createdAt: '2026-09-09T12:00:00Z',
    }]);
  });

  it.each([
    ['createPublicMatchRoom', createPublicMatchRoom, 'create_public_match_room'],
    ['joinPublicMatchRoom', joinPublicMatchRoom, 'join_public_match_room'],
  ])('maps %s results', async (_name, action, rpcName) => {
    mockRpc.mockReturnValue({
      single: () => Promise.resolve({
        data: { room_id: 'room-2', room_code: 'DEF567', is_host: rpcName === 'create_public_match_room' },
        error: null,
      }),
    });
    await expect(action('classic')).resolves.toEqual({
      roomId: 'room-2', roomCode: 'DEF567', isHost: rpcName === 'create_public_match_room',
    });
    expect(mockRpc).toHaveBeenCalledWith(rpcName, expect.any(Object));
  });
});
