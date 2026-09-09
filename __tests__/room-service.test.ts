jest.mock('@/lib/supabase/client', () => ({ supabase: { rpc: jest.fn() } }));

import { joinPublicMatchmaking } from '@/features/rooms/room-service';
import { supabase } from '@/lib/supabase/client';

const mockRpc = supabase.rpc as jest.Mock;

describe('public matchmaking service', () => {
  beforeEach(() => mockRpc.mockReset());

  it('maps an allocated public room', async () => {
    mockRpc.mockReturnValue({ single: () => Promise.resolve({ data: { room_id: 'room-1', room_code: 'ABC234', is_host: false, matched_existing: true }, error: null }) });
    await expect(joinPublicMatchmaking('classic')).resolves.toEqual({ roomId: 'room-1', roomCode: 'ABC234', isHost: false, matchedExisting: true });
  });
});
