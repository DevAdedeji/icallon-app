import { useEffect, useState } from 'react';
import {
  View, Text, Pressable, ScrollView, StyleSheet,
  ActivityIndicator, Share, Alert,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AntDesign from '@expo/vector-icons/AntDesign';
import { supabase } from '@/lib/supabase/client';
import { Fonts } from '@/constants/theme';

type Player = {
  id: string;
  display_name: string;
  is_host: boolean;
  total_score: number;
  is_connected: boolean;
};

export default function LobbyScreen() {
  const insets = useSafeAreaInsets();
  const { roomId, roomCode, isHost } = useLocalSearchParams<{
    roomId: string;
    roomCode: string;
    isHost: string;
  }>();

  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  // Fetch players and subscribe to real-time updates
  useEffect(() => {
    if (!roomId) return;

    const fetchPlayers = async () => {
      const { data, error } = await supabase
        .from('players')
        .select('id, display_name, is_host, total_score, is_connected')
        .eq('room_id', roomId);
      if (!error && data) setPlayers(data);
      setLoading(false);
    };

    fetchPlayers();

    const channel = supabase
      .channel(`room-${roomId}-players`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${roomId}` },
        () => { fetchPlayers(); }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        (payload) => {
          if (payload.new.status === 'playing') {
            router.replace({ pathname: '/game', params: { roomId, roomCode } });
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [roomId, roomCode]);

  const handleStartGame = async () => {
    setStarting(true);
    const { error } = await supabase
      .from('rooms')
      .update({ status: 'playing', started_at: new Date().toISOString(), current_round: 1 })
      .eq('id', roomId);
    if (error) {
      Alert.alert('Error', 'Failed to start game. Try again.');
    }
    setStarting(false);
  };

  const handleShare = () => {
    Share.share({ message: `Join my ICallOn game! Room code: ${roomCode}` });
  };

  return (
    <View style={styles.container}>
      <Pressable onPress={() => router.back()} style={[styles.backButton, { top: insets.top + 12 }]}>
        <AntDesign name="arrow-left" size={20} color="#9CB7A1" />
        <Text style={styles.backText}>Back</Text>
      </Pressable>

      <ScrollView contentContainerStyle={styles.scrollContent} style={styles.scroll}>
        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.kicker}>GAME LOBBY</Text>
            <Text style={styles.title}>Room Code</Text>
            <View style={styles.codeBox}>
              <Text style={styles.codeText}>{roomCode}</Text>
            </View>
            <Pressable onPress={handleShare} style={styles.shareButton}>
              <AntDesign name="share-alt" size={16} color="#7CFD4D" />
              <Text style={styles.shareText}>Share invite</Text>
            </Pressable>
          </View>

          {/* Players */}
          <View style={styles.section}>
            <View style={styles.sectionRow}>
              <AntDesign name="team" size={16} color="#7CFD4D" />
              <Text style={styles.sectionLabel}>Players</Text>
              <Text style={styles.playerCount}>{players.length}</Text>
            </View>

            {loading ? (
              <ActivityIndicator color="#7CFD4D" style={{ marginTop: 16 }} />
            ) : players.length === 0 ? (
              <Text style={styles.emptyText}>Waiting for players to join…</Text>
            ) : (
              <View style={styles.playerList}>
                {players.map((p) => (
                  <View key={p.id} style={styles.playerRow}>
                    <View style={styles.playerAvatar}>
                      <AntDesign name="user" size={16} color="#7CFD4D" />
                    </View>
                    <Text style={styles.playerName}>{p.display_name}</Text>
                    {p.is_host && (
                      <View style={styles.hostBadge}>
                        <Text style={styles.hostBadgeText}>HOST</Text>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Start button — host only */}
          {isHost === 'true' && (
            <Pressable
              style={[styles.startButton, (starting || players.length < 1) && styles.buttonDisabled]}
              onPress={handleStartGame}
              disabled={starting || players.length < 1}
            >
              {starting
                ? <ActivityIndicator color="#071108" />
                : <>
                    <AntDesign name="caret-right" size={16} color="#071108" />
                    <Text style={styles.startButtonText}>Start Game</Text>
                  </>
              }
            </Pressable>
          )}

          {isHost !== 'true' && (
            <View style={styles.waitingBox}>
              <ActivityIndicator color="#7CFD4D" size="small" />
              <Text style={styles.waitingText}>Waiting for host to start…</Text>
            </View>
          )}
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
  header: { alignItems: 'center', marginBottom: 32 },
  kicker: { color: '#9CB7A1', letterSpacing: 2.2, fontSize: 12, fontFamily: Fonts.mono, marginBottom: 8 },
  title: { color: '#F3FFF6', fontSize: 20, fontWeight: '700', fontFamily: Fonts.sans, marginBottom: 12 },
  codeBox: {
    backgroundColor: 'rgba(124, 253, 77, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(124, 253, 77, 0.4)',
    borderRadius: 16,
    paddingHorizontal: 28,
    paddingVertical: 14,
    marginBottom: 12,
  },
  codeText: { color: '#7CFD4D', fontSize: 36, fontWeight: '900', fontFamily: Fonts.mono, letterSpacing: 8 },
  shareButton: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  shareText: { color: '#7CFD4D', fontSize: 14, fontFamily: Fonts.sans, fontWeight: '600' },
  section: { marginBottom: 28 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 },
  sectionLabel: { color: '#E6F3E8', fontSize: 14, fontWeight: '700', fontFamily: Fonts.sans, flex: 1 },
  playerCount: { color: '#9CB7A1', fontSize: 14, fontFamily: Fonts.mono },
  emptyText: { color: 'rgba(255,255,255,0.4)', fontSize: 14, fontFamily: Fonts.sans, textAlign: 'center', marginTop: 8 },
  playerList: { gap: 10 },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  playerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(124, 253, 77, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerName: { color: '#F3FFF6', fontSize: 15, fontFamily: Fonts.sans, flex: 1 },
  hostBadge: {
    backgroundColor: 'rgba(124, 253, 77, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(124, 253, 77, 0.4)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  hostBadgeText: { color: '#7CFD4D', fontSize: 10, fontFamily: Fonts.mono, fontWeight: '700' },
  startButton: {
    height: 56,
    borderRadius: 14,
    backgroundColor: '#7CFD4D',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonDisabled: { opacity: 0.45 },
  startButtonText: { color: '#071108', fontSize: 16, fontWeight: '900', fontFamily: Fonts.sans },
  waitingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  waitingText: { color: 'rgba(255,255,255,0.5)', fontSize: 14, fontFamily: Fonts.sans },
});
