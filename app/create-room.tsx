import { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AntDesign from '@expo/vector-icons/AntDesign';
import { supabase } from '@/lib/supabase/client';
import { Fonts } from '@/constants/theme';
import { ensurePlayerProfile } from '@/features/auth/profile';
import { createId } from '@/lib/game';

const ROUND_OPTIONS = [3, 5, 7, 10];
const TIMER_OPTIONS = [30, 60, 90, 120];

export default function CreateRoomScreen() {
  const insets = useSafeAreaInsets();
  const [maxRounds, setMaxRounds] = useState<number | null>(null);
  const [timePerRound, setTimePerRound] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreateRoom = async () => {
    if (!maxRounds || !timePerRound) {
      setError('Please select rounds and timer');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError('You must be logged in to create a room');
        return;
      }
      await ensurePlayerProfile(user);

      function generateRoomCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
        return code;
      }

      let roomCode = generateRoomCode();
      for (let i = 0; i < 10; i++) {
        const { data: existing } = await supabase.from('rooms').select('id').eq('code', roomCode).maybeSingle();
        if (!existing) break;
        roomCode = generateRoomCode();
      }

      const roomId = createId();
      const { data: room, error: insertError } = await supabase
        .from('rooms')
        .insert({
          id: roomId,
          code: roomCode,
          host_id: user.id,
          max_rounds: maxRounds,
          time_per_round: timePerRound,
          status: 'lobby',
        })
        .select()
        .single();

      if (insertError || !room) {
        setError(insertError?.message ?? 'Failed to create room');
        return;
      }

      // Create the host as a player
      const { data: userData } = await supabase
        .from('users')
        .select('username')
        .eq('id', user.id)
        .maybeSingle();

      await supabase.from('players').insert({
        id: createId(),
        room_id: room.id,
        user_id: user.id,
        display_name: userData?.username ?? user.email ?? 'Host',
        is_host: true,
      });

      router.replace({ pathname: '/lobby', params: { roomId: room.id, roomCode: room.code, isHost: 'true' } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create room');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Pressable onPress={() => router.back()} style={[styles.backButton, { top: insets.top + 12 }]}>
        <AntDesign name="arrow-left" size={20} color="#9CB7A1" />
        <Text style={styles.backText}>Back</Text>
      </Pressable>
      <ScrollView contentContainerStyle={styles.scrollContent} style={styles.scroll}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.kicker}>ROOM SETUP</Text>
            <Text style={styles.title}>Create Room</Text>
            <Text style={styles.subtitle}>Configure your game settings below.</Text>
          </View>

          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Number of Rounds</Text>
            <View style={styles.optionRow}>
              {ROUND_OPTIONS.map((r) => (
                <Pressable
                  key={r}
                  onPress={() => setMaxRounds(r)}
                  style={[styles.optionTile, maxRounds === r && styles.optionTileActive]}
                >
                  <Text style={[styles.optionTileText, maxRounds === r && styles.optionTileTextActive]}>{r}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Time per Round (seconds)</Text>
            <View style={styles.optionRow}>
              {TIMER_OPTIONS.map((t) => (
                <Pressable
                  key={t}
                  onPress={() => setTimePerRound(t)}
                  style={[styles.optionTile, timePerRound === t && styles.optionTileActive]}
                >
                  <Text style={[styles.optionTileText, timePerRound === t && styles.optionTileTextActive]}>{t}s</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <Pressable
            style={[styles.createButton, (loading || !maxRounds || !timePerRound) && styles.buttonDisabled]}
            onPress={handleCreateRoom}
            disabled={loading || !maxRounds || !timePerRound}
          >
            {loading ? <ActivityIndicator color="#071108" /> : <Text style={styles.createButtonText}>Create Room</Text>}
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A120A' },
  scroll: { width: '100%' },
  scrollContent: { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
  content: { width: '100%', maxWidth: 400, paddingHorizontal: 24, paddingVertical: 32 },
  backButton: { position: 'absolute', left: 24, zIndex: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  backText: { color: '#9CB7A1', fontSize: 14, fontFamily: Fonts.sans },
  header: { marginBottom: 28 },
  kicker: { color: '#9CB7A1', letterSpacing: 2.2, fontSize: 12, fontFamily: Fonts.mono, marginBottom: 8 },
  title: { color: '#F3FFF6', fontSize: 34, fontWeight: '900', fontFamily: Fonts.rounded, marginBottom: 6 },
  subtitle: { color: '#CFE7D4', fontSize: 15, fontFamily: Fonts.sans },
  errorBox: {
    backgroundColor: 'rgba(220, 38, 38, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.5)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
  },
  errorText: { color: '#FCA5A5', fontSize: 14, fontFamily: Fonts.sans, fontWeight: '600' },
  section: { marginBottom: 28 },
  sectionLabel: { color: '#E6F3E8', fontSize: 14, fontWeight: '700', fontFamily: Fonts.sans, marginBottom: 12 },
  optionRow: { flexDirection: 'row', gap: 10 },
  optionTile: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionTileActive: {
    backgroundColor: '#7CFD4D',
    borderColor: '#7CFD4D',
  },
  optionTileText: { color: '#CFE7D4', fontSize: 16, fontWeight: '700', fontFamily: Fonts.sans },
  optionTileTextActive: { color: '#071108' },
  createButton: {
    height: 56,
    borderRadius: 14,
    backgroundColor: '#7CFD4D',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.45 },
  createButtonText: { color: '#071108', fontSize: 16, fontWeight: '900', fontFamily: Fonts.sans },
});
