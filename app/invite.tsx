import AntDesign from '@expo/vector-icons/AntDesign';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Fonts } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-context';
import { inviteCodeFromParam } from '@/features/rooms/room-invite';

export default function InviteScreen() {
  const { code } = useLocalSearchParams<{ code?: string | string[] }>();
  const { isLoading, session } = useAuth();
  const roomCode = inviteCodeFromParam(code);

  useEffect(() => {
    if (!isLoading && session && roomCode) {
      router.replace({ pathname: '/join-room', params: { code: roomCode } });
    }
  }, [isLoading, roomCode, session]);

  if (isLoading || (session && roomCode)) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color="#7CFD4D" size="large" />
        <Text style={styles.loadingText}>Preparing your invite…</Text>
      </View>
    );
  }

  if (!roomCode) {
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <AntDesign name="warning" color="#F8D77A" size={30} />
          <Text style={styles.title}>Invite not recognized</Text>
          <Text style={styles.subtitle}>Ask the host to share a fresh ICallOn invitation.</Text>
          <Pressable style={styles.secondaryButton} onPress={() => router.replace('/welcome')}>
            <Text style={styles.secondaryText}>Go to home</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const authParams = { returnTo: '/join-room', roomCode };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.icon}><AntDesign name="mail" color="#071108" size={24} /></View>
        <Text style={styles.kicker}>YOU’RE INVITED</Text>
        <Text style={styles.title}>Join the room</Text>
        <Text style={styles.subtitle}>Sign in first, then we’ll take you straight to this game.</Text>
        <View style={styles.codeBox}>
          <Text style={styles.codeLabel}>ROOM CODE</Text>
          <Text testID="invite-room-code" style={styles.code}>{roomCode}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          testID="invite-login"
          style={styles.primaryButton}
          onPress={() => router.push({ pathname: '/login', params: authParams })}
        >
          <Text style={styles.primaryText}>Log in to join</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          testID="invite-signup"
          style={styles.secondaryButton}
          onPress={() => router.push({ pathname: '/signup', params: authParams })}
        >
          <Text style={styles.secondaryText}>Create an account</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A120A', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 },
  loadingText: { color: '#CFE7D4', fontFamily: Fonts.sans, fontSize: 15 },
  card: { width: '100%', maxWidth: 400, padding: 26, borderRadius: 24, borderWidth: 1, borderColor: 'rgba(124,253,77,0.34)', backgroundColor: 'rgba(13,30,15,0.96)', gap: 14, alignItems: 'center' },
  icon: { width: 54, height: 54, borderRadius: 18, backgroundColor: '#7CFD4D', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  kicker: { color: '#7CFD4D', fontSize: 11, letterSpacing: 2, fontFamily: Fonts.mono },
  title: { color: '#F3FFF6', fontSize: 32, fontWeight: '900', fontFamily: Fonts.rounded, textAlign: 'center' },
  subtitle: { color: '#CFE7D4', fontSize: 15, lineHeight: 22, fontFamily: Fonts.sans, textAlign: 'center' },
  codeBox: { width: '100%', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(124,253,77,0.45)', backgroundColor: 'rgba(124,253,77,0.09)', paddingVertical: 14, alignItems: 'center', marginVertical: 5 },
  codeLabel: { color: '#9CB7A1', fontSize: 9, letterSpacing: 1.6, fontFamily: Fonts.mono },
  code: { color: '#F3FFF6', fontSize: 26, letterSpacing: 5, fontWeight: '900', fontFamily: Fonts.mono, marginTop: 4 },
  primaryButton: { width: '100%', height: 54, borderRadius: 14, backgroundColor: '#7CFD4D', alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#071108', fontSize: 15, fontWeight: '900', fontFamily: Fonts.sans },
  secondaryButton: { width: '100%', height: 52, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.24)', backgroundColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: '#E6F3E8', fontSize: 15, fontWeight: '700', fontFamily: Fonts.sans },
});
