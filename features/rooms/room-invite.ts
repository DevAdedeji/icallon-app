import { roomCodeSchema } from '@/features/rooms/room-validation';

const WEB_APP_ORIGIN = 'https://i-call-on.vercel.app';

export type RoomInvite = {
  appUrl: string;
  message: string;
  roomCode: string;
  webUrl: string;
};

export function inviteCodeFromParam(value: string | string[] | undefined): string | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  const result = roomCodeSchema.safeParse(candidate ?? '');
  return result.success ? result.data : null;
}

export function buildRoomInvite(roomId: string, code: string): RoomInvite {
  const roomCode = roomCodeSchema.parse(code);
  const appUrl = `icallon://invite?code=${encodeURIComponent(roomCode)}`;
  const webUrl = `${WEB_APP_ORIGIN}/play/${encodeURIComponent(roomId)}`;

  return {
    appUrl,
    roomCode,
    webUrl,
    message: [
      'Join my ICallOn game!',
      `Room code: ${roomCode}`,
      `Open in the app: ${appUrl}`,
      `Or play on the web: ${webUrl}`,
    ].join('\n'),
  };
}
