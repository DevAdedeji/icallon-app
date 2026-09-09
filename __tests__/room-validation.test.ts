import { roomCodeSchema, roomSettingsSchema } from '@/features/rooms/room-validation';

describe('room input validation', () => {
  it('normalizes valid room codes', () => {
    expect(roomCodeSchema.parse(' ab2cd3 ')).toBe('AB2CD3');
  });

  it('rejects ambiguous and malformed room codes', () => {
    expect(roomCodeSchema.safeParse('AB10IO').success).toBe(false);
    expect(roomCodeSchema.safeParse('ABC12').success).toBe(false);
  });

  it('accepts only the game settings supported by the UI and database', () => {
    expect(roomSettingsSchema.safeParse({ maxRounds: 5, timePerRound: 60 }).success).toBe(true);
    expect(roomSettingsSchema.safeParse({ maxRounds: 4, timePerRound: 45 }).success).toBe(false);
  });
});
