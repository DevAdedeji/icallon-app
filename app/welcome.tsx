import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/features/auth/auth-context';
import { Fonts } from '@/constants/theme';

export default function WelcomeScreen() {
  const [fade] = useState(() => new Animated.Value(0));
  const [rise] = useState(() => new Animated.Value(20));
  const [glow] = useState(() => new Animated.Value(0.4));
  const { session } = useAuth();

  useEffect(() => {
    // Animation
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: 850,
        useNativeDriver: true,
      }),
      Animated.timing(rise, {
        toValue: 0,
        duration: 850,
        useNativeDriver: true,
      }),
      Animated.loop(
        Animated.sequence([
          Animated.timing(glow, {
            toValue: 0.9,
            duration: 1800,
            useNativeDriver: true,
          }),
          Animated.timing(glow, {
            toValue: 0.35,
            duration: 1800,
            useNativeDriver: true,
          }),
        ])
      ),
    ]).start();

  }, [fade, glow, rise]);

  const openProtectedRoute = (path: '/create-room' | '/join-room') => {
    if (session) {
      router.push(path);
    } else {
      router.push({ pathname: '/login', params: { returnTo: path } });
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.backgroundLayer}>
        <Animated.View style={[styles.orbLarge, { opacity: glow }]} />
        <Animated.View style={[styles.orbSmall, { opacity: glow }]} />
      </View>

      <Animated.View
        style={[
          styles.content,
          {
            opacity: fade,
            transform: [{ translateY: rise }],
          },
        ]}>
        <Text style={styles.kicker}>MULTIPLAYER WORD BATTLE</Text>
        <Text style={styles.title}>ICallOn</Text>
        <Text style={styles.subtitle}>
          Race the clock. Pick the letter. Outscore everyone.
        </Text>

        <View style={styles.buttonRow}>
          <Pressable
            accessibilityRole="button"
            onPress={() => openProtectedRoute('/create-room')}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryPressed]}>
            <Text style={styles.primaryText}>Create Room</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => openProtectedRoute('/join-room')}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryPressed]}>
            <Text style={styles.secondaryText}>Join Room</Text>
          </Pressable>

          {!session && (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/login')}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryPressed]}>
              <Text style={styles.secondaryText}>Login</Text>
            </Pressable>
          )}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A120A',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  backgroundLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    overflow: 'hidden',
  },
  orbLarge: {
    position: 'absolute',
    top: -120,
    right: -80,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: '#7CFD4D',
  },
  orbSmall: {
    position: 'absolute',
    bottom: -80,
    left: -40,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: '#2BD18A',
  },
  content: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    borderRadius: 28,
    backgroundColor: 'rgba(9, 20, 10, 0.84)',
    paddingVertical: 34,
    paddingHorizontal: 24,
    gap: 14,
  },
  kicker: {
    color: '#9CB7A1',
    letterSpacing: 2.2,
    fontSize: 12,
    fontFamily: Fonts.mono,
  },
  title: {
    color: '#F3FFF6',
    fontSize: 52,
    lineHeight: 54,
    fontFamily: Fonts.rounded,
    fontWeight: '900',
  },
  subtitle: {
    color: '#CFE7D4',
    fontSize: 17,
    lineHeight: 24,
    maxWidth: 320,
    fontFamily: Fonts.sans,
  },
  buttonRow: {
    marginTop: 18,
    gap: 12,
  },
  primaryButton: {
    height: 56,
    borderRadius: 14,
    backgroundColor: '#7CFD4D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryPressed: {
    opacity: 0.86,
  },
  primaryText: {
    color: '#071108',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3,
    fontFamily: Fonts.sans,
  },
  secondaryButton: {
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryPressed: {
    opacity: 0.8,
  },
  secondaryText: {
    color: '#E6F3E8',
    fontSize: 15,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
});
