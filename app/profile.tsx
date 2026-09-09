import AntDesign from '@expo/vector-icons/AntDesign';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Fonts } from '@/constants/theme';
import {
  getMatchHistory,
  getPlayerStats,
  getProgression,
  type MatchHistoryItem,
  type PlayerStats,
} from '@/features/profile/profile-service';
import { EMPTY_PLAYER_STATS } from '@/features/profile/profile-state';
import { achievementsFor, EMPTY_PROGRESSION, type Progression } from '@/features/profile/progression-state';
import { supabase } from '@/lib/supabase/client';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const [username, setUsername] = useState('Player');
  const [stats, setStats] = useState<PlayerStats>(EMPTY_PLAYER_STATS);
  const [history, setHistory] = useState<MatchHistoryItem[]>([]);
  const [progression, setProgression] = useState<Progression>(EMPTY_PROGRESSION);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Your session expired. Please log in again.');
      const [{ data: profile, error: profileError }, nextStats, nextHistory, nextProgression] = await Promise.all([
        supabase.from('users').select('username').eq('id', user.id).maybeSingle(),
        getPlayerStats(),
        getMatchHistory(),
        getProgression(),
      ]);
      if (profileError) throw profileError;
      setUsername(profile?.username ?? user.email?.split('@')[0] ?? 'Player');
      setStats(nextStats);
      setHistory(nextHistory);
      setProgression(nextProgression);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Your profile could not be loaded.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  return (
    <View style={styles.screen}>
      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <Pressable testID="profile-back" accessibilityRole="button" accessibilityLabel="Back to home" onPress={() => router.back()} style={styles.backButton}>
          <AntDesign name="arrow-left" size={20} color="#CFE7D4" />
          <Text style={styles.backText}>Back</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor="#7CFD4D" onRefresh={() => {
          setRefreshing(true);
          void loadProfile();
        }} />}
      >
        <Text style={styles.kicker}>PLAYER PROFILE</Text>
        <Text testID="profile-username" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.55} style={styles.title}>{username}</Text>
        <Text style={styles.subtitle}>Your ICallOn record, built one battle at a time.</Text>

        {loading ? (
          <ActivityIndicator testID="profile-loading" color="#7CFD4D" size="large" style={styles.loader} />
        ) : error ? (
          <View accessibilityRole="alert" style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable accessibilityRole="button" onPress={() => {
              setLoading(true);
              void loadProfile();
            }} style={styles.retryButton}>
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View testID="profile-stats" style={styles.statsGrid}>
              <StatCard label="Group games" value={stats.gamesPlayed} />
              <StatCard label="Wins" value={stats.wins} accent />
              <StatCard label="Total points" value={stats.totalPoints} />
              <StatCard label="Best score" value={stats.bestScore} />
              <StatCard label="Win streak" value={stats.currentWinStreak} wide />
            </View>

            <View testID="profile-level" style={styles.levelCard}>
              <View style={styles.levelBadge}><Text style={styles.levelNumber}>{progression.level}</Text></View>
              <View style={styles.levelCopy}>
                <View style={styles.levelHeading}><Text style={styles.levelTitle}>Level {progression.level}</Text><Text style={styles.levelXp}>{progression.xp} XP</Text></View>
                <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.min(100, (progression.levelProgress / progression.levelTarget) * 100)}%` }]} /></View>
                <Text style={styles.levelMeta}>{progression.levelProgress}/{progression.levelTarget} XP to the next level</Text>
              </View>
            </View>

            <View style={styles.modeStats}>
              <Text style={styles.modeStat}>{progression.soloGames} solo games</Text>
              <Text style={styles.modeDot}>·</Text>
              <Text style={styles.modeStat}>{progression.soloWins} solo wins</Text>
              <Text style={styles.modeDot}>·</Text>
              <Text style={styles.modeStat}>{progression.dailyChallenges} dailies</Text>
            </View>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Achievements</Text>
              <Text style={styles.sectionCount}>{achievementsFor(progression).filter((item) => item.unlocked).length}/{achievementsFor(progression).length}</Text>
            </View>
            <View testID="profile-achievements" style={styles.achievementList}>
              {achievementsFor(progression).map((achievement) => <View key={achievement.id} style={[styles.achievementCard, achievement.unlocked && styles.achievementUnlocked]}><Text style={[styles.achievementIcon, !achievement.unlocked && styles.achievementLocked]}>{achievement.icon}</Text><View style={styles.achievementCopy}><Text style={[styles.achievementName, achievement.unlocked && styles.achievementNameUnlocked]}>{achievement.name}</Text><Text style={styles.achievementDescription}>{achievement.description}</Text></View><Text style={styles.achievementProgress}>{achievement.unlocked ? 'UNLOCKED' : `${achievement.progress}/${achievement.target}`}</Text></View>)}
            </View>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recent games</Text>
              <Text style={styles.sectionCount}>{history.length}</Text>
            </View>

            {history.length === 0 ? (
              <View testID="profile-empty-history" style={styles.emptyCard}>
                <Text style={styles.emptyIcon}>◎</Text>
                <Text style={styles.emptyTitle}>No completed games yet</Text>
                <Text style={styles.emptyText}>Finish your first game and its result will appear here.</Text>
              </View>
            ) : (
              <View testID="profile-history" style={styles.historyList}>
                {history.map((match) => <MatchCard key={match.gameResultId} match={match} />)}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function StatCard({ accent = false, label, value, wide = false }: { accent?: boolean; label: string; value: number; wide?: boolean }) {
  return (
    <View accessibilityLabel={`${label}: ${value}`} style={[styles.statCard, wide && styles.statCardWide, accent && styles.statCardAccent]}>
      <Text style={[styles.statValue, accent && styles.statValueAccent]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function MatchCard({ match }: { match: MatchHistoryItem }) {
  const completed = new Date(match.completedAt);
  const date = Number.isNaN(completed.getTime())
    ? 'Completed game'
    : completed.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  return (
    <View accessibilityLabel={`${match.isWinner ? 'Won' : `Placed ${match.placement}`}, ${match.score} points`} style={styles.matchCard}>
      <View style={[styles.resultBadge, match.isWinner && styles.resultBadgeWin]}>
        <Text style={[styles.resultBadgeText, match.isWinner && styles.resultBadgeTextWin]}>{match.isWinner ? 'WIN' : `#${match.placement}`}</Text>
      </View>
      <View style={styles.matchCopy}>
        <Text style={styles.matchTitle}>Room {match.roomCode}</Text>
        <Text style={styles.matchMeta}>{date} · {match.playerCount} players</Text>
        {!match.isWinner && <Text numberOfLines={1} style={styles.winnerText}>Winner: {match.winnerName}</Text>}
      </View>
      <View style={styles.matchScoreWrap}>
        <Text style={styles.matchScore}>{match.score}</Text>
        <Text style={styles.matchPoints}>PTS</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0A120A' },
  topBar: { minHeight: 64, paddingHorizontal: 24, justifyContent: 'flex-end' },
  backButton: { alignSelf: 'flex-start', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 7 },
  backText: { color: '#CFE7D4', fontFamily: Fonts.sans, fontWeight: '700' },
  content: { width: '100%', maxWidth: 540, alignSelf: 'center', padding: 24, paddingBottom: 48 },
  kicker: { color: '#7CFD4D', fontFamily: Fonts.mono, fontSize: 11, letterSpacing: 2.2, marginBottom: 8 },
  title: { color: '#F3FFF6', fontFamily: Fonts.rounded, fontSize: 38, fontWeight: '900' },
  subtitle: { color: '#CFE7D4', fontFamily: Fonts.sans, fontSize: 15, lineHeight: 22, marginTop: 6, marginBottom: 24 },
  loader: { marginVertical: 70 },
  errorBox: { borderRadius: 14, borderWidth: 1, borderColor: 'rgba(248,113,113,0.5)', backgroundColor: 'rgba(248,113,113,0.12)', padding: 18, gap: 14 },
  errorText: { color: '#FCA5A5', fontFamily: Fonts.sans, lineHeight: 21 },
  retryButton: { minHeight: 44, borderRadius: 10, justifyContent: 'center', alignItems: 'center', backgroundColor: '#7CFD4D' },
  retryText: { color: '#071108', fontFamily: Fonts.sans, fontWeight: '900' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: { width: '48.5%', minHeight: 96, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.13)', backgroundColor: 'rgba(255,255,255,0.06)', padding: 16, justifyContent: 'center' },
  statCardWide: { width: '100%' },
  statCardAccent: { borderColor: 'rgba(124,253,77,0.45)', backgroundColor: 'rgba(124,253,77,0.12)' },
  statValue: { color: '#F3FFF6', fontFamily: Fonts.mono, fontSize: 27, fontWeight: '900' },
  statValueAccent: { color: '#7CFD4D' },
  statLabel: { color: '#9CB7A1', fontFamily: Fonts.sans, fontSize: 12, fontWeight: '700', marginTop: 5, textTransform: 'uppercase', letterSpacing: 0.8 },
  levelCard: { marginTop: 12, borderRadius: 17, borderWidth: 1, borderColor: 'rgba(124,253,77,0.42)', backgroundColor: 'rgba(124,253,77,0.1)', padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 },
  levelBadge: { width: 52, height: 52, borderRadius: 17, backgroundColor: '#7CFD4D', alignItems: 'center', justifyContent: 'center' },
  levelNumber: { color: '#071108', fontFamily: Fonts.rounded, fontSize: 25, fontWeight: '900' },
  levelCopy: { flex: 1 },
  levelHeading: { flexDirection: 'row', alignItems: 'center' },
  levelTitle: { color: '#F3FFF6', fontFamily: Fonts.rounded, fontSize: 18, fontWeight: '900', flex: 1 },
  levelXp: { color: '#7CFD4D', fontFamily: Fonts.mono, fontSize: 11, fontWeight: '800' },
  progressTrack: { height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.12)', overflow: 'hidden', marginTop: 9 },
  progressFill: { height: '100%', borderRadius: 4, backgroundColor: '#7CFD4D' },
  levelMeta: { color: '#9CB7A1', fontFamily: Fonts.sans, fontSize: 10, marginTop: 6 },
  modeStats: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 7, marginTop: 12 },
  modeStat: { color: '#9CB7A1', fontFamily: Fonts.sans, fontSize: 11 },
  modeDot: { color: '#526B57', fontFamily: Fonts.mono },
  achievementList: { gap: 9 },
  achievementCard: { minHeight: 70, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', backgroundColor: 'rgba(255,255,255,0.04)', padding: 12, flexDirection: 'row', alignItems: 'center', gap: 11 },
  achievementUnlocked: { borderColor: 'rgba(248,215,122,0.35)', backgroundColor: 'rgba(248,215,122,0.07)' },
  achievementIcon: { fontSize: 24 },
  achievementLocked: { opacity: 0.28 },
  achievementCopy: { flex: 1 },
  achievementName: { color: '#78917D', fontFamily: Fonts.sans, fontWeight: '800' },
  achievementNameUnlocked: { color: '#F8D77A' },
  achievementDescription: { color: '#78917D', fontFamily: Fonts.sans, fontSize: 11, marginTop: 3 },
  achievementProgress: { color: '#9CB7A1', fontFamily: Fonts.mono, fontSize: 8, letterSpacing: 0.5 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginTop: 32, marginBottom: 12 },
  sectionTitle: { color: '#F3FFF6', fontFamily: Fonts.rounded, fontWeight: '900', fontSize: 21, flex: 1 },
  sectionCount: { color: '#9CB7A1', fontFamily: Fonts.mono },
  emptyCard: { alignItems: 'center', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.04)', padding: 28 },
  emptyIcon: { color: '#7CFD4D', fontSize: 32 },
  emptyTitle: { color: '#F3FFF6', fontFamily: Fonts.sans, fontSize: 16, fontWeight: '800', marginTop: 10 },
  emptyText: { color: '#9CB7A1', fontFamily: Fonts.sans, lineHeight: 20, marginTop: 6, textAlign: 'center' },
  historyList: { gap: 10 },
  matchCard: { minHeight: 92, borderRadius: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.06)', padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12 },
  resultBadge: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.09)' },
  resultBadgeWin: { backgroundColor: 'rgba(124,253,77,0.16)' },
  resultBadgeText: { color: '#CFE7D4', fontFamily: Fonts.mono, fontSize: 12, fontWeight: '900' },
  resultBadgeTextWin: { color: '#7CFD4D' },
  matchCopy: { flex: 1, minWidth: 0 },
  matchTitle: { color: '#F3FFF6', fontFamily: Fonts.sans, fontWeight: '800' },
  matchMeta: { color: '#9CB7A1', fontFamily: Fonts.sans, fontSize: 12, marginTop: 3 },
  winnerText: { color: '#CFE7D4', fontFamily: Fonts.sans, fontSize: 12, marginTop: 3 },
  matchScoreWrap: { alignItems: 'flex-end' },
  matchScore: { color: '#7CFD4D', fontFamily: Fonts.mono, fontSize: 20, fontWeight: '900' },
  matchPoints: { color: '#78917D', fontFamily: Fonts.mono, fontSize: 8, letterSpacing: 1 },
});
