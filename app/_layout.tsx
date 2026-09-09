import { Stack } from 'expo-router';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router/react-navigation';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import 'react-native-reanimated';

import { AuthProvider, useAuth } from '@/features/auth/auth-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { GameFeedbackProvider } from '@/features/feedback/game-feedback';

export default function RootLayout() {
  return (
    <GameFeedbackProvider>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </GameFeedbackProvider>
  );
}

function RootNavigator() {
  const colorScheme = useColorScheme();
  const { initializationError, isLoading, session } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#7CFD4D" size="large" />
        <Text style={styles.statusText}>Restoring your session…</Text>
      </View>
    );
  }

  if (initializationError) {
    return (
      <View style={styles.centered}>
        <Text accessibilityRole="alert" style={styles.errorText}>{initializationError}</Text>
      </View>
    );
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="welcome" />
        <Stack.Screen name="invite" />
        <Stack.Screen name="auth/callback" />
        <Stack.Screen name="login" />
        <Stack.Screen name="signup" />

        <Stack.Protected guard={Boolean(session)}>
          <Stack.Screen name="game-lobby" />
          <Stack.Screen name="profile" />
          <Stack.Screen name="create-room" />
          <Stack.Screen name="join-room" />
          <Stack.Screen name="lobby" />
          <Stack.Screen name="game" />
          <Stack.Screen name="solo" />
          <Stack.Screen name="daily" />
          <Stack.Screen name="matchmaking" />
        </Stack.Protected>
      </Stack>
      <StatusBar style="light" />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  centered: {
    alignItems: 'center',
    backgroundColor: '#0A120A',
    flex: 1,
    gap: 14,
    justifyContent: 'center',
    padding: 24,
  },
  statusText: {
    color: '#CFE7D4',
    fontSize: 15,
  },
  errorText: {
    color: '#FCA5A5',
    fontSize: 15,
    textAlign: 'center',
  },
});
