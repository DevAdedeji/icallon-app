import { render } from '@testing-library/react-native';

import { AnswerEntry } from '@/app/game';
import type { Round } from '@/lib/game';

jest.mock('@/lib/supabase/client', () => ({ supabase: {} }));
jest.mock('@/features/auth/auth-context', () => ({ useAuth: () => ({ session: null }) }));
jest.mock('@/features/feedback/game-feedback', () => ({ useGameFeedback: () => ({ playSound: jest.fn() }) }));
jest.mock('@/features/game/leaderboard', () => ({ Leaderboard: () => null }));
jest.mock('@/features/rooms/use-room-presence', () => ({ useRoomPresence: jest.fn() }));

const round: Round = {
  id: 'round-1',
  room_id: 'room-1',
  round_number: 1,
  letter: 'A',
  status: 'active',
  started_at: '2026-09-10T00:00:00.000Z',
  ended_at: null,
};

const commonProps = {
  categories: [{ key: 'name' as const, label: 'Name' }],
  round,
  answers: { name: 'Ada', animal: '', place: '', thing: '' },
  onChange: jest.fn(),
  secondsLeft: 30,
  submitted: false,
  isHost: true,
  isPublic: false,
  onSubmit: jest.fn(),
  onEnd: jest.fn(),
};

describe('answer entry action feedback', () => {
  it('keeps the submit button quiet while the host closes submissions', async () => {
    const screen = await render(<AnswerEntry {...commonProps} submitting={false} closing />);

    expect(screen.queryByTestId('submit-answers-spinner')).toBeNull();
    expect(screen.getByText('Submit answers')).toBeTruthy();
    expect(screen.getByTestId('close-submissions-spinner')).toBeTruthy();
  });

  it('shows submit progress only for an explicit answer submission', async () => {
    const screen = await render(<AnswerEntry {...commonProps} submitting closing={false} />);

    expect(screen.getByTestId('submit-answers-spinner')).toBeTruthy();
    expect(screen.queryByTestId('close-submissions-spinner')).toBeNull();
  });
});
