import AntDesign from '@expo/vector-icons/AntDesign';
import { Redirect, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { InteractivePressable as Pressable } from '@/components/interactive-pressable';
import { Fonts } from '@/constants/theme';
import { CATEGORY_PACKS, categoryPackName, type CategoryPackId } from '@/features/game/category-packs';
import { ENABLE_PAUSED_GAME_MODES } from '@/features/game/game-modes';
import {
  createPublicMatchRoom,
  joinPublicMatchRoom,
  listPublicMatchRooms,
  type PublicMatchRoom,
} from '@/features/rooms/room-service';

type MatchmakingPack = Exclude<CategoryPackId, 'custom'>;

function waitingTime(createdAt: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60_000));
  if (minutes < 1) return 'just opened';
  if (minutes === 1) return 'waiting 1 min';
  return `waiting ${minutes} mins`;
}

export default function MatchmakingRoute() {
  if (!ENABLE_PAUSED_GAME_MODES) return <Redirect href="/game-lobby" />;
  return <MatchmakingScreen />;
}

function MatchmakingScreen() {
  const insets = useSafeAreaInsets();
  const [pack, setPack] = useState<MatchmakingPack>('classic');
  const [rooms, setRooms] = useState<PublicMatchRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [joiningRoomId, setJoiningRoomId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadRooms = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      setRooms(await listPublicMatchRooms(pack));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Open matches could not be loaded.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [pack]);

  useEffect(() => {
    const task = setTimeout(() => { void loadRooms(); }, 0);
    return () => clearTimeout(task);
  }, [loadRooms]);

  const openLobby = (roomId: string) => {
    router.replace({ pathname: '/lobby', params: { roomId, source: 'matchmaking' } });
  };

  const join = async (roomId: string) => {
    setJoiningRoomId(roomId);
    setError(null);
    try {
      const room = await joinPublicMatchRoom(roomId);
      openLobby(room.roomId);
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : 'This room is no longer available.');
      setJoiningRoomId(null);
      await loadRooms(true);
    }
  };

  const create = async () => {
    setCreating(true);
    setError(null);
    try {
      const room = await createPublicMatchRoom(pack);
      openLobby(room.roomId);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'A public match could not be created.');
      setCreating(false);
    }
  };

  const busy = creating || joiningRoomId !== null;

  return (
    <View style={styles.screen}>
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.backButton}>
          <AntDesign name="arrow-left" size={20} color="#CFE7D4" />
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Refresh available matches"
          accessibilityRole="button"
          disabled={refreshing}
          onPress={() => { setRefreshing(true); void loadRooms(true); }}
          style={styles.refreshButton}>
          <AntDesign name="reload" size={17} color="#70C8FF" />
          <Text style={styles.refreshText}>Refresh</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void loadRooms(true); }} tintColor="#70C8FF" />}>
        <Text style={styles.kicker}>QUICK MATCH</Text>
        <Text style={styles.title}>Choose your room.</Text>
        <Text style={styles.subtitle}>See who is waiting, pick a match, or open your own public lobby.</Text>

        <Text style={styles.sectionLabel}>Category pack</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.packRow}>
          {CATEGORY_PACKS.map((item) => (
            <Pressable
              accessibilityRole="button"
              testID={`matchmaking-pack-${item.id}`}
              key={item.id}
              disabled={busy}
              onPress={() => setPack(item.id)}
              style={[styles.packChip, pack === item.id && styles.packChipActive]}>
              <Text style={[styles.packChipText, pack === item.id && styles.packChipTextActive]}>{item.name}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.listHeading}>
          <View>
            <Text style={styles.sectionLabel}>Available matches</Text>
            <Text style={styles.resultCount}>{rooms.length} open · {categoryPackName(pack)}</Text>
          </View>
          {!loading && <View style={styles.livePill}><View style={styles.liveDot} /><Text style={styles.liveText}>LIVE</Text></View>}
        </View>

        {error && <View accessibilityRole="alert" style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>}

        {loading ? (
          <View style={styles.loadingBox}><ActivityIndicator color="#70C8FF" /><Text style={styles.loadingText}>Checking open rooms…</Text></View>
        ) : rooms.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyIcon}>◎</Text>
            <Text style={styles.emptyTitle}>No one is waiting yet</Text>
            <Text style={styles.emptyText}>Open the first {categoryPackName(pack)} room and other players will see it here.</Text>
          </View>
        ) : (
          <View style={styles.roomList}>
            {rooms.map((room) => {
              const joining = joiningRoomId === room.roomId;
              return (
                <View key={room.roomId} testID={`public-room-${room.roomId}`} style={styles.roomCard}>
                  <View style={styles.roomTopRow}>
                    <View style={styles.avatar}><Text style={styles.avatarText}>{room.hostName.slice(0, 1).toUpperCase()}</Text></View>
                    <View style={styles.roomCopy}>
                      <Text numberOfLines={1} style={styles.hostName}>{room.hostName}’s room</Text>
                      <Text style={styles.roomMeta}>{waitingTime(room.createdAt)} · 3 rounds</Text>
                    </View>
                    <View style={styles.playerPill}>
                      <AntDesign name="team" size={13} color="#70C8FF" />
                      <Text style={styles.playerCount}>{room.playerCount}/{room.maxPlayers}</Text>
                    </View>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    testID={`join-public-room-${room.roomId}`}
                    disabled={busy}
                    onPress={() => void join(room.roomId)}
                    style={[styles.joinButton, busy && !joining && styles.disabled]}>
                    {joining ? <ActivityIndicator color="#071108" /> : <Text style={styles.joinButtonText}>Join this match</Text>}
                  </Pressable>
                </View>
              );
            })}
          </View>
        )}

        <View style={styles.rulesCard}>
          <AntDesign name="safety" size={18} color="#7CFD4D" />
          <View style={styles.rulesCopy}>
            <Text style={styles.rulesTitle}>No player acts as referee</Text>
            <Text style={styles.rulesText}>The server draws each letter and scores letter matches and duplicates automatically.</Text>
          </View>
        </View>

        <Pressable
          testID="create-public-match"
          accessibilityRole="button"
          disabled={busy}
          onPress={() => void create()}
          style={[styles.primaryButton, busy && styles.disabled]}>
          {creating ? <ActivityIndicator color="#071108" /> : <><AntDesign name="plus" size={18} color="#071108" /><Text style={styles.primaryText}>Create public match</Text></>}
        </Pressable>
        <Text style={styles.hint}>Public games support 2–4 players, 3 rounds, and 60 seconds per round.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0A120A' },
  topBar: { minHeight: 66, paddingHorizontal: 24, paddingBottom: 8, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  backButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 7 },
  backText: { color: '#CFE7D4', fontFamily: Fonts.sans, fontWeight: '700' },
  refreshButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 6 },
  refreshText: { color: '#70C8FF', fontFamily: Fonts.sans, fontWeight: '700', fontSize: 13 },
  content: { width: '100%', maxWidth: 540, alignSelf: 'center', padding: 24, paddingBottom: 50 },
  kicker: { color: '#70C8FF', fontFamily: Fonts.mono, fontSize: 11, letterSpacing: 2.1, marginBottom: 8 },
  title: { color: '#F3FFF6', fontFamily: Fonts.rounded, fontSize: 38, lineHeight: 44, fontWeight: '900' },
  subtitle: { color: '#CFE7D4', fontFamily: Fonts.sans, fontSize: 15, lineHeight: 22, marginTop: 8, marginBottom: 24 },
  sectionLabel: { color: '#F3FFF6', fontFamily: Fonts.sans, fontSize: 14, fontWeight: '800' },
  packRow: { gap: 8, paddingVertical: 11, paddingRight: 20 },
  packChip: { minHeight: 40, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  packChipActive: { borderColor: '#70C8FF', backgroundColor: 'rgba(112,200,255,0.13)' },
  packChipText: { color: '#CFE7D4', fontFamily: Fonts.sans, fontSize: 13, fontWeight: '700' },
  packChipTextActive: { color: '#70C8FF' },
  listHeading: { marginTop: 15, marginBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  resultCount: { color: '#78917D', fontFamily: Fonts.sans, fontSize: 11, marginTop: 3 },
  livePill: { borderRadius: 10, backgroundColor: 'rgba(124,253,77,0.1)', paddingHorizontal: 9, paddingVertical: 5, flexDirection: 'row', alignItems: 'center', gap: 5 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#7CFD4D' },
  liveText: { color: '#7CFD4D', fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1 },
  roomList: { gap: 10 },
  roomCard: { borderRadius: 16, borderWidth: 1, borderColor: 'rgba(112,200,255,0.25)', backgroundColor: 'rgba(112,200,255,0.07)', padding: 14 },
  roomTopRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#70C8FF' },
  avatarText: { color: '#071108', fontFamily: Fonts.rounded, fontWeight: '900', fontSize: 17 },
  roomCopy: { flex: 1, minWidth: 0 },
  hostName: { color: '#F3FFF6', fontFamily: Fonts.sans, fontWeight: '800', fontSize: 15 },
  roomMeta: { color: '#9CB7A1', fontFamily: Fonts.sans, fontSize: 11, marginTop: 3 },
  playerPill: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  playerCount: { color: '#70C8FF', fontFamily: Fonts.mono, fontWeight: '800', fontSize: 12 },
  joinButton: { minHeight: 44, borderRadius: 11, backgroundColor: '#70C8FF', alignItems: 'center', justifyContent: 'center', marginTop: 13 },
  joinButtonText: { color: '#071108', fontFamily: Fonts.sans, fontWeight: '900' },
  loadingBox: { minHeight: 145, alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  loadingText: { color: '#9CB7A1', fontFamily: Fonts.sans, fontSize: 13 },
  emptyBox: { minHeight: 170, alignItems: 'center', justifyContent: 'center', padding: 24, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(112,200,255,0.28)', backgroundColor: 'rgba(112,200,255,0.04)' },
  emptyIcon: { color: '#70C8FF', fontSize: 35 },
  emptyTitle: { color: '#F3FFF6', fontFamily: Fonts.sans, fontWeight: '800', fontSize: 16, marginTop: 5 },
  emptyText: { color: '#9CB7A1', fontFamily: Fonts.sans, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 5 },
  rulesCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, marginTop: 18, padding: 13, borderRadius: 13, backgroundColor: 'rgba(124,253,77,0.07)', borderWidth: 1, borderColor: 'rgba(124,253,77,0.2)' },
  rulesCopy: { flex: 1 },
  rulesTitle: { color: '#E6F3E8', fontFamily: Fonts.sans, fontWeight: '800', fontSize: 13 },
  rulesText: { color: '#9CB7A1', fontFamily: Fonts.sans, fontSize: 11, lineHeight: 16, marginTop: 3 },
  primaryButton: { minHeight: 56, borderRadius: 14, backgroundColor: '#7CFD4D', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 9, marginTop: 18 },
  primaryText: { color: '#071108', fontFamily: Fonts.sans, fontWeight: '900', fontSize: 16 },
  hint: { color: '#78917D', fontFamily: Fonts.sans, fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 10 },
  errorBox: { borderRadius: 12, borderWidth: 1, borderColor: 'rgba(248,113,113,0.5)', backgroundColor: 'rgba(248,113,113,0.12)', padding: 12, marginBottom: 12 },
  errorText: { color: '#FCA5A5', fontFamily: Fonts.sans },
  disabled: { opacity: 0.55 },
});
