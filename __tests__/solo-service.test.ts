jest.mock('@/lib/supabase/client', () => ({ supabase: { rpc: jest.fn() } }));

import { getDailyChallenge, recordSoloResult } from '@/features/solo/solo-service';
import { supabase } from '@/lib/supabase/client';

const mockRpc = supabase.rpc as jest.Mock;

beforeEach(() => mockRpc.mockReset());

describe('solo service', () => {
  it('maps the daily challenge contract', async () => {
    mockRpc.mockReturnValue({ single: () => Promise.resolve({ data: { challenge_date: '2026-09-09', category_pack: 'food', seed: 'daily:2026-09-09', completed: false, player_score: null, opponent_score: null }, error: null }) });
    await expect(getDailyChallenge()).resolves.toEqual({ challengeDate: '2026-09-09', categoryPack: 'food', seed: 'daily:2026-09-09', completed: false, playerScore: null, opponentScore: null });
  });

  it('passes the server-owned daily date with the result', async () => {
    mockRpc.mockResolvedValue({ error: null });
    await recordSoloResult({ resultId: 'daily-result', mode: 'daily', challengeDate: '2026-09-09', difficulty: 'hard', categoryPack: 'world', playerScore: 90, opponentScore: 100 });
    expect(mockRpc).toHaveBeenCalledWith('record_solo_result', expect.objectContaining({ requested_mode: 'daily', requested_challenge_date: '2026-09-09' }));
  });
});
