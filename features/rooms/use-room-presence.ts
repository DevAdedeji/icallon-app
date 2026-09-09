import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { setRoomPresence } from '@/features/rooms/room-service';

const HEARTBEAT_INTERVAL_MS = 30_000;

export function useRoomPresence(roomId: string | undefined, onResume?: () => void | Promise<void>): void {
  const onResumeRef = useRef(onResume);

  useEffect(() => {
    onResumeRef.current = onResume;
  }, [onResume]);

  useEffect(() => {
    if (!roomId) return;
    let active = true;

    const markPresence = (connected: boolean) => {
      void setRoomPresence(roomId, connected).catch(() => {
        // A state refresh handles stale or ended rooms. Presence must never
        // prevent the player from continuing a game.
      });
    };

    if (AppState.currentState === 'active') markPresence(true);

    const heartbeat = setInterval(() => {
      if (active && AppState.currentState === 'active') markPresence(true);
    }, HEARTBEAT_INTERVAL_MS);

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (!active) return;
      const connected = nextState === 'active';
      markPresence(connected);
      if (connected) void onResumeRef.current?.();
    });

    return () => {
      active = false;
      clearInterval(heartbeat);
      subscription.remove();
    };
  }, [roomId]);
}
