import { roomCodeSchema, roomSettingsSchema } from '@/features/rooms/room-validation';
import { buildRoomInvite, inviteCodeFromParam } from '@/features/rooms/room-invite';

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

  it('normalizes a room code from deep-link parameters', () => {
    expect(inviteCodeFromParam('ab2cd3')).toBe('AB2CD3');
    expect(inviteCodeFromParam(['jk3mn4', 'ignored'])).toBe('JK3MN4');
    expect(inviteCodeFromParam('not-a-code')).toBeNull();
  });

  it('builds app and web options into a room invitation', () => {
    const invite = buildRoomInvite('room/id with spaces', 'ab2cd3');

    expect(invite.appUrl).toBe('icallon://invite?code=AB2CD3');
    expect(invite.webUrl).toBe('https://i-call-on.vercel.app/play/room%2Fid%20with%20spaces');
    expect(invite.message).toContain('Room code: AB2CD3');
    expect(invite.message).toContain(invite.appUrl);
    expect(invite.message).toContain(invite.webUrl);
  });
});
