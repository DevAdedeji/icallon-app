import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import AntDesign from '@expo/vector-icons/AntDesign';

import { Fonts } from '@/constants/theme';
import { getActiveRoomSession, type ActiveRoomSession } from '@/features/rooms/room-service';
import { supabase } from '@/lib/supabase/client';
import { InteractivePressable as Pressable } from '@/components/interactive-pressable';
import { useGameFeedback } from '@/features/feedback/game-feedback';

export default function GameLobbyScreen() {
  const { soundEnabled, toggleSound } = useGameFeedback();
  const [name, setName] = useState('Player');
  const [activeRoom, setActiveRoom] = useState<ActiveRoomSession | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      const load = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.replace('/login');
          return;
        }
        const [{ data }, restoredRoom] = await Promise.all([
          supabase.from('users').select('username').eq('id', user.id).maybeSingle(),
          getActiveRoomSession().catch(() => null),
        ]);
        if (!active) return;
        setName(data?.username ?? user.email?.split('@')[0] ?? 'Player');
        setActiveRoom(restoredRoom);
        setLoading(false);
      };

      void load();
      return () => { active = false; };
    }, [])
  );

  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace('/welcome');
  };

  if (loading) return <View style={styles.container}><ActivityIndicator color="#7CFD4D" /></View>;

  return (
    <View style={styles.container}>
      <Text style={styles.kicker}>MULTIPLAYER WORD BATTLE</Text>
      <Text style={styles.title}>Hey, {name}.</Text>
      <Text style={styles.subtitle}>Bring your people together, race the clock, and decide which answers deserve the points.</Text>
      <Pressable accessibilityRole="switch" accessibilityState={{ checked: soundEnabled }} style={styles.soundButton} onPress={toggleSound}>
        <AntDesign name={soundEnabled ? 'sound' : 'sound'} color={soundEnabled ? '#7CFD4D' : '#78917D'} size={16} />
        <Text style={[styles.soundText, !soundEnabled && styles.soundTextMuted]}>Game sounds {soundEnabled ? 'on' : 'off'}</Text>
      </Pressable>
      {activeRoom && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Resume room ${activeRoom.roomCode}`}
          testID="home-resume-room"
          style={styles.resumeCard}
          onPress={() => router.push({
            pathname: activeRoom.status === 'playing' ? '/game' : '/lobby',
            params: { roomId: activeRoom.roomId },
          })}
        >
          <View style={styles.resumeIcon}><AntDesign name="sync" color="#071108" size={17} /></View>
          <View style={styles.resumeCopy}>
            <Text style={styles.resumeLabel}>{activeRoom.status === 'playing' ? 'GAME IN PROGRESS' : 'ROOM WAITING'}</Text>
            <Text style={styles.resumeTitle}>Resume {activeRoom.roomCode}</Text>
          </View>
          <AntDesign name="right" color="#7CFD4D" size={15} />
        </Pressable>
      )}
      <Pressable accessibilityRole="button" testID="home-profile" style={styles.profileButton} onPress={() => router.push('/profile')}>
        <AntDesign name="user" color="#7CFD4D" size={17} />
        <Text style={styles.profileText}>Profile & game history</Text>
        <AntDesign name="right" color="#9CB7A1" size={14} />
      </Pressable>
      <Pressable accessibilityRole="button" testID="home-create-room" style={styles.primaryButton} onPress={() => router.push('/create-room')}>
        <Text style={styles.primaryText}>Create a room</Text>
      </Pressable>
      <Pressable accessibilityRole="button" testID="home-join-room" style={styles.button} onPress={() => router.push('/join-room')}>
        <Text style={styles.buttonText}>Join with a room code</Text>
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
  soundButton: { alignSelf: 'flex-start', minHeight: 38, paddingHorizontal: 11, borderRadius: 19, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', backgroundColor: 'rgba(255,255,255,0.05)', flexDirection: 'row', alignItems: 'center', gap: 7 },
  soundText: { color: '#CFE7D4', fontFamily: Fonts.sans, fontSize: 12, fontWeight: '700' },
  soundTextMuted: { color: '#78917D' },
  resumeCard: { minHeight: 68, marginTop: 10, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(124,253,77,0.5)', backgroundColor: 'rgba(124,253,77,0.12)', flexDirection: 'row', alignItems: 'center', gap: 12 },
  resumeIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#7CFD4D', alignItems: 'center', justifyContent: 'center' },
  resumeCopy: { flex: 1 },
  resumeLabel: { color: '#7CFD4D', fontSize: 9, letterSpacing: 1.3, fontFamily: Fonts.mono },
  resumeTitle: { color: '#F3FFF6', fontSize: 16, fontWeight: '900', fontFamily: Fonts.sans, marginTop: 3 },
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
