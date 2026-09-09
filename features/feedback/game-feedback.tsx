import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAudioPlayer } from 'expo-audio';
import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const SOUND_PREFERENCE_KEY = 'icallon:sound-enabled';

export type GameSound = 'countdown' | 'roundStart' | 'submit' | 'success';

type GameFeedbackValue = {
  soundEnabled: boolean;
  playSound: (sound: GameSound) => void;
  toggleSound: () => void;
};

const GameFeedbackContext = createContext<GameFeedbackValue | null>(null);

export function GameFeedbackProvider({ children }: PropsWithChildren) {
  const [soundEnabled, setSoundEnabled] = useState(true);
  const countdown = useAudioPlayer(require('../../assets/audio/countdown.wav'));
  const roundStart = useAudioPlayer(require('../../assets/audio/round-start.wav'));
  const submit = useAudioPlayer(require('../../assets/audio/tap.wav'));
  const success = useAudioPlayer(require('../../assets/audio/success.wav'));

  useEffect(() => {
    void AsyncStorage.getItem(SOUND_PREFERENCE_KEY).then((stored) => {
      if (stored !== null) setSoundEnabled(stored === 'true');
    });
  }, []);

  const playSound = useCallback((sound: GameSound) => {
    if (!soundEnabled) return;
    const player = { countdown, roundStart, submit, success }[sound];
    void player.seekTo(0).then(() => player.play()).catch(() => undefined);
  }, [countdown, roundStart, soundEnabled, submit, success]);

  const toggleSound = useCallback(() => {
    setSoundEnabled((current) => {
      const next = !current;
      void AsyncStorage.setItem(SOUND_PREFERENCE_KEY, String(next));
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ soundEnabled, playSound, toggleSound }),
    [playSound, soundEnabled, toggleSound],
  );

  return <GameFeedbackContext.Provider value={value}>{children}</GameFeedbackContext.Provider>;
}

export function useGameFeedback(): GameFeedbackValue {
  const context = useContext(GameFeedbackContext);
  if (!context) throw new Error('useGameFeedback must be used inside GameFeedbackProvider.');
  return context;
}
