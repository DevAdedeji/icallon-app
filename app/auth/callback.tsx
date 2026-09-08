import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { completeOAuthCallback } from '@/lib/supabase/oauth';

export default function AuthCallback() {
  const url = Linking.useURL();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const handleDeepLink = async () => {
      if (!url) return;

      try {
        await completeOAuthCallback(url);
        router.replace('/game-lobby');
      } catch (error: unknown) {
        setErrorMessage(error instanceof Error ? error.message : 'Authentication could not be completed.');
      }
    };

    handleDeepLink();
  }, [url]);

  if (errorMessage) {
    return (
      <View style={styles.container}>
        <Text accessibilityRole="alert" style={styles.error}>{errorMessage}</Text>
        <Pressable accessibilityRole="button" onPress={() => router.replace('/login')} style={styles.button}>
          <Text style={styles.buttonText}>Back to login</Text>
        </Pressable>
      </View>
    );
  }

  return <View style={styles.container}><ActivityIndicator size="large" color="#7CFD4D" /></View>;
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: '#0A120A',
    flex: 1,
    gap: 18,
    justifyContent: 'center',
    padding: 24,
  },
  error: { color: '#FCA5A5', fontSize: 15, textAlign: 'center' },
  button: { backgroundColor: '#7CFD4D', borderRadius: 12, paddingHorizontal: 20, paddingVertical: 14 },
  buttonText: { color: '#071108', fontSize: 15, fontWeight: '800' },
});
