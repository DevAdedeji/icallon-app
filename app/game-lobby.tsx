import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import AntDesign from '@expo/vector-icons/AntDesign';

import { Fonts } from '@/constants/theme';
import { supabase } from '@/lib/supabase/client';

export default function GameLobbyScreen() {
  const [name, setName] = useState('Player');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/login');
        return;
      }
      const { data } = await supabase.from('users').select('username').eq('id', user.id).maybeSingle();
      setName(data?.username ?? user.email?.split('@')[0] ?? 'Player');
      setLoading(false);
    };
    load();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace('/welcome');
  };

  if (loading) return <View style={styles.container}><ActivityIndicator color="#7CFD4D" /></View>;

  return (
    <View style={styles.container}>
      <Text style={styles.kicker}>READY TO PLAY</Text>
      <Text style={styles.title}>Hey, {name}.</Text>
      <Text style={styles.subtitle}>Start a new word battle or enter a friend’s room code.</Text>
      <Pressable accessibilityRole="button" testID="home-profile" style={styles.profileButton} onPress={() => router.push('/profile')}>
        <AntDesign name="user" color="#7CFD4D" size={17} />
        <Text style={styles.profileText}>Profile & game history</Text>
        <AntDesign name="right" color="#9CB7A1" size={14} />
      </Pressable>
      <Pressable accessibilityRole="button" testID="home-create-room" style={styles.primaryButton} onPress={() => router.push('/create-room')}>
        <Text style={styles.primaryText}>Create Room</Text>
      </Pressable>
      <Pressable accessibilityRole="button" testID="home-join-room" style={styles.button} onPress={() => router.push('/join-room')}>
        <Text style={styles.buttonText}>Join Room</Text>
      </Pressable>
      <Pressable accessibilityRole="button" testID="home-sign-out" style={styles.signOutButton} onPress={signOut}>
        <AntDesign name="logout" color="#FF6B6B" size={15} />
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A120A',
    paddingHorizontal: 24,
    justifyContent: 'center',
    gap: 14,
  },
  title: {
    color: '#F3FFF6',
    fontSize: 38,
    fontWeight: '900',
    fontFamily: Fonts.rounded,
  },
  kicker: { color: '#9CB7A1', fontSize: 12, letterSpacing: 2, fontFamily: Fonts.mono },
  subtitle: {
    color: '#CFE7D4',
    fontSize: 16,
    lineHeight: 22,
    fontFamily: Fonts.sans,
  },
  profileButton: { minHeight: 52, marginTop: 8, paddingHorizontal: 15, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(124,253,77,0.25)', backgroundColor: 'rgba(124,253,77,0.07)', flexDirection: 'row', alignItems: 'center', gap: 10 },
  profileText: { color: '#E6F3E8', fontSize: 14, fontWeight: '700', fontFamily: Fonts.sans, flex: 1 },
  button: {
    marginTop: 10,
    height: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  primaryButton: { marginTop: 12, height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#7CFD4D' },
  primaryText: { color: '#071108', fontSize: 15, fontWeight: '800', fontFamily: Fonts.sans },
  buttonText: {
    color: '#E6F3E8',
    fontSize: 15,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  signOutButton: { alignSelf: 'center', minHeight: 44, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  signOutText: { color: '#FF6B6B', fontSize: 14, fontWeight: '700', fontFamily: Fonts.sans, textDecorationLine: 'underline', textDecorationColor: '#FF6B6B' },
});
