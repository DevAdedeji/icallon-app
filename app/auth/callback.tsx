import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase/client';

export default function AuthCallback() {
  const url = Linking.useURL();

  useEffect(() => {
    const handleDeepLink = async () => {
      if (!url) return;

      try {
        // Extract the URL parameters
        const { data, error } = await supabase.auth.getSession();

        if (error) {
          console.error('Auth callback error:', error);
          router.replace('/login');
          return;
        }

        // Check if we now have a session (OAuth was successful)
        if (data.session) {
          // Redirect to game lobby on successful auth
          router.replace('/game-lobby');
        } else {
          router.replace('/login');
        }
      } catch (error) {
        console.error('Deep link handling error:', error);
        router.replace('/login');
      }
    };

    handleDeepLink();
  }, [url]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0A120A' }}>
      <ActivityIndicator size="large" color="#7CFD4D" />
    </View>
  );
}
