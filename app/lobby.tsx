import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, Pressable, ScrollView, StyleSheet,
  ActivityIndicator, Share,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AntDesign from '@expo/vector-icons/AntDesign';
import { supabase } from '@/lib/supabase/client';
import { Fonts } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-context';
import { startGame } from '@/features/game/game-service';
import { useRoomPresence } from '@/features/rooms/use-room-presence';
import { buildRoomInvite } from '@/features/rooms/room-invite';
import { categoryPackName } from '@/features/game/category-packs';

type Player = {
  id: string;
  display_name: string;
  is_host: boolean;
  total_score: number;
  is_connected: boolean;
};

export default function LobbyScreen() {
  const insets = useSafeAreaInsets();
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const { session } = useAuth();

  const [players, setPlayers] = useState<Player[]>([]);
  const [roomCode, setRoomCode] = useState('');
  const [packName, setPackName] = useState('Classic');
  const [isPublic, setIsPublic] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'offline'>('connecting');

  const loadPlayers = useCallback(async () => {
    if (!roomId) return;
    const { data, error: playersError } = await supabase
      .from('players')
      .select('id, display_name, is_host, total_score, is_connected')
      .eq('room_id', roomId)
      .order('joined_at');
    if (playersError) throw playersError;
    setPlayers(data ?? []);
  }, [roomId]);

  const loadRoom = useCallback(async () => {
    if (!roomId || !session?.user.id) return;
    const { data, error: roomError } = await supabase
      .from('rooms')
      .select('id, code, host_id, status, category_pack, is_public')
      .eq('id', roomId)
      .maybeSingle();
    if (roomError) throw roomError;
    if (!data) throw new Error('This room is no longer available.');

    setRoomCode(data.code);
    setPackName(categoryPackName(data.category_pack));
    setIsPublic(Boolean(data.is_public));
    setIsHost(data.host_id === session.user.id);
    if (data.status === 'playing') {
      router.replace({ pathname: '/game', params: { roomId: data.id } });
    } else if (data.status === 'ended') {
      throw new Error('This game has already ended.');
    }
  }, [roomId, session?.user.id]);

  useRoomPresence(roomId, async () => {
    await Promise.all([loadRoom(), loadPlayers()]);
  });

  // Fetch players and subscribe to real-time updates
  useEffect(() => {
    if (!roomId) return;
    let active = true;

    const initialize = async () => {
      try {
        await Promise.all([loadRoom(), loadPlayers()]);
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Could not load this lobby.');
      } finally {
        if (active) setLoading(false);
      }
    };

    void initialize();

    // RealtimeClient reuses channels by topic. A unique mount suffix avoids
    // attaching callbacks to a channel whose asynchronous cleanup is pending.
    const channelTopic = `room-${roomId}-players-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(channelTopic)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${roomId}` },
        () => { void loadPlayers().catch(() => setConnectionStatus('offline')); }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        () => { void loadRoom().catch((loadError) => setError(loadError.message)); }
      )
      .subscribe((status) => {
        if (!active) return;
        if (status === 'SUBSCRIBED') setConnectionStatus('connected');
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setConnectionStatus('offline');
        }
      });

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [roomId, loadPlayers, loadRoom]);

  const handleStartGame = async () => {
    setStarting(true);
    setError(null);
    try {
      await startGame(roomId);
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : 'Failed to start game.');
    } finally {
      setStarting(false);
    }
  };

  const handleShare = async () => {
    setShareStatus(null);
    try {
      const invite = buildRoomInvite(roomId, roomCode);
      await Share.share({ title: 'Join my ICallOn game', message: invite.message });
      setShareStatus('Invite ready to send — it includes app and web options.');
    } catch (shareError) {
      setShareStatus(shareError instanceof Error ? shareError.message : 'Could not open the share sheet.');
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
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.kicker}>GAME LOBBY</Text>
            {isPublic && <Text testID="public-room-badge" style={styles.publicBadge}>PUBLIC QUICK MATCH</Text>}
            <Text style={connectionStatus === 'connected' ? styles.connectedText : styles.offlineText}>
              {connectionStatus === 'connected' ? 'LIVE' : connectionStatus === 'connecting' ? 'CONNECTING…' : 'RECONNECTING…'}
            </Text>
            <Text style={styles.title}>Room Code</Text>
            <Text testID="lobby-category-pack" style={styles.packText}>{packName}</Text>
            <View style={styles.codeBox}>
              <Text testID="room-code" style={styles.codeText}>{roomCode}</Text>
            </View>
            <Pressable accessibilityRole="button" testID="share-room-button" onPress={() => { void handleShare(); }} style={styles.shareButton}>
              <AntDesign name="share-alt" size={16} color="#7CFD4D" />
              <Text style={styles.shareText}>Share invite</Text>
            </Pressable>
            {shareStatus && <Text accessibilityLiveRegion="polite" style={styles.shareStatus}>{shareStatus}</Text>}
          </View>

          {error && <View accessibilityRole="alert" style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>}

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
                    {!p.is_connected && <Text style={styles.awayText}>AWAY</Text>}
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Start button — host only */}
          {isHost && (
            <Pressable
              accessibilityRole="button"
              testID="start-game-button"
              style={[styles.startButton, (starting || players.length < (isPublic ? 2 : 1)) && styles.buttonDisabled]}
              onPress={handleStartGame}
              disabled={starting || players.length < (isPublic ? 2 : 1)}
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

          {!isHost && (
            <View style={styles.waitingBox}>
              <ActivityIndicator color="#7CFD4D" size="small" />
              <Text style={styles.waitingText}>Waiting for host to start…</Text>
            </View>
          )}
          {isHost && isPublic && players.length < 2 && <Text style={styles.publicHint}>Waiting for at least one opponent…</Text>}
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
  packText: { color: '#9CB7A1', fontSize: 12, fontFamily: Fonts.sans, marginTop: -8, marginBottom: 12 },
  connectedText: { color: '#7CFD4D', fontSize: 10, fontFamily: Fonts.mono, letterSpacing: 1.4, marginBottom: 8 },
  offlineText: { color: '#F8D77A', fontSize: 10, fontFamily: Fonts.mono, letterSpacing: 1.1, marginBottom: 8 },
  publicBadge: { color: '#70C8FF', fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1.3, marginBottom: 7 },
  shareStatus: { color: '#9CB7A1', fontSize: 11, lineHeight: 16, fontFamily: Fonts.sans, textAlign: 'center', marginTop: 8, maxWidth: 280 },
  errorBox: { backgroundColor: 'rgba(220,38,38,0.14)', borderColor: 'rgba(220,38,38,0.5)', borderRadius: 12, borderWidth: 1, marginBottom: 20, padding: 12 },
  errorText: { color: '#FCA5A5', fontFamily: Fonts.sans, fontSize: 14 },
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
  awayText: { color: '#F8D77A', fontSize: 9, fontFamily: Fonts.mono, letterSpacing: 1 },
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
  publicHint: { color: '#9CB7A1', fontFamily: Fonts.sans, fontSize: 12, textAlign: 'center', marginTop: 10 },
});
