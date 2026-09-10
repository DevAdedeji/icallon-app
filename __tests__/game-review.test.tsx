import { fireEvent, render } from '@testing-library/react-native';

import { LetterPicker, Review } from '@/app/game';
import type { GameAnswer, Round } from '@/lib/game';

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
  status: 'submitted',
  started_at: '2026-09-10T00:00:00.000Z',
  ended_at: null,
};

const submittedAnswer: GameAnswer = {
  id: 'answer-1',
  player_id: 'player-1',
  player_name: 'Ada',
  name: 'Alice',
  animal: 'Antelope',
  place: 'Abuja',
  thing: 'Anchor',
  name_valid: true,
  animal_valid: false,
  place_valid: true,
  thing_valid: true,
  points_earned: 30,
};

const categories = [{ key: 'name' as const, label: 'Name' }];

describe('live answer review', () => {
  it('shows guests the current verdicts without reviewer controls', async () => {
    const screen = await render(<Review categories={categories} round={round} answers={[submittedAnswer]} isHost={false} onValidate={jest.fn()} onConfirm={jest.fn()} busy={false} />);

    expect(screen.getByText('Review in progress')).toBeTruthy();
    expect(screen.getByTestId('verdict-Ada-name').props.accessibilityLabel).toBe('Name marked right');
    expect(screen.queryByTestId('score-Ada-name-valid')).toBeNull();
    expect(screen.queryByTestId('confirm-round-button')).toBeNull();
  });

  it('lets the host make consecutive review decisions', async () => {
    const onValidate = jest.fn();
    const screen = await render(<Review categories={categories} round={round} answers={[submittedAnswer]} isHost onValidate={onValidate} onConfirm={jest.fn()} busy={false} />);

    await fireEvent.press(screen.getByTestId('score-Ada-name-invalid'));
    await fireEvent.press(screen.getByTestId('score-Ada-name-valid'));

    expect(onValidate).toHaveBeenNthCalledWith(1, submittedAnswer, 'name', false);
    expect(onValidate).toHaveBeenNthCalledWith(2, submittedAnswer, 'name', true);
  });
});

describe('letter selection feedback', () => {
  it('shows a strong focus state before selection', async () => {
    const screen = await render(<LetterPicker number={1} isHost isPublic={false} onPick={jest.fn()} busy={false} />);
    const option = screen.getByTestId('letter-option-A');

    await fireEvent(option, 'focus', {});

    expect(option).toHaveStyle({ borderColor: '#7CFD4D' });
  });
});
