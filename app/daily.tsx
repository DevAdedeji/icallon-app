import AntDesign from '@expo/vector-icons/AntDesign';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Fonts } from '@/constants/theme';
import { categoryPackName } from '@/features/game/category-packs';
import { getDailyChallenge, type DailyChallenge } from '@/features/solo/solo-service';
import { InteractivePressable as Pressable } from '@/components/interactive-pressable';

export default function DailyScreen() {
  const insets = useSafeAreaInsets();
  const [challenge, setChallenge] = useState<DailyChallenge | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setChallenge(await getDailyChallenge());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Today’s challenge could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 12 }]}>
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.backButton}><AntDesign name="arrow-left" size={20} color="#CFE7D4" /><Text style={styles.backText}>Back</Text></Pressable>
      <View style={styles.content}>
        <Text style={styles.calendar}>◫</Text>
        <Text style={styles.kicker}>TODAY’S CHALLENGE</Text>
        <Text style={styles.title}>Same puzzle.{"\n"}One shot.</Text>
        <Text style={styles.subtitle}>Everyone gets the same pack and letters today. Come back tomorrow for a fresh battle.</Text>
        {loading ? <ActivityIndicator color="#7CFD4D" size="large" /> : error ? <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text><Pressable onPress={() => { setLoading(true); void load(); }}><Text style={styles.retryText}>Try again</Text></Pressable></View> : challenge && (
          <>
            <View testID="daily-card" style={styles.challengeCard}>
              <Text style={styles.cardLabel}>TODAY’S PACK</Text>
              <Text style={styles.cardTitle}>{categoryPackName(challenge.categoryPack)}</Text>
              <Text style={styles.cardDate}>{challenge.challengeDate}</Text>
            </View>
            {challenge.completed ? (
              <View testID="daily-completed" style={styles.completedCard}>
                <Text style={styles.completedLabel}>CHALLENGE COMPLETE</Text>
                <Text style={styles.completedScore}>{challenge.playerScore} PTS</Text>
                <Text style={styles.completedMeta}>Computer: {challenge.opponentScore} pts</Text>
              </View>
            ) : (
              <Pressable testID="daily-start" accessibilityRole="button" onPress={() => router.push({ pathname: '/solo', params: { mode: 'daily', pack: challenge.categoryPack, date: challenge.challengeDate, seed: challenge.seed } })} style={styles.primaryButton}><Text style={styles.primaryText}>Play today’s challenge</Text></Pressable>
            )}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0A120A', paddingHorizontal: 24 },
  backButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 7 },
  backText: { color: '#CFE7D4', fontFamily: Fonts.sans, fontWeight: '700' },
  content: { width: '100%', maxWidth: 520, alignSelf: 'center', flex: 1, justifyContent: 'center', paddingBottom: 48 },
  calendar: { color: '#7CFD4D', fontSize: 48, marginBottom: 18 },
  kicker: { color: '#7CFD4D', fontFamily: Fonts.mono, fontSize: 11, letterSpacing: 2.1, marginBottom: 8 },
  title: { color: '#F3FFF6', fontFamily: Fonts.rounded, fontSize: 39, lineHeight: 44, fontWeight: '900' },
  subtitle: { color: '#CFE7D4', fontFamily: Fonts.sans, fontSize: 15, lineHeight: 22, marginTop: 10, marginBottom: 26 },
  challengeCard: { borderRadius: 17, borderWidth: 1, borderColor: 'rgba(124,253,77,0.45)', backgroundColor: 'rgba(124,253,77,0.11)', padding: 18 },
  cardLabel: { color: '#7CFD4D', fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1.5 },
  cardTitle: { color: '#F3FFF6', fontFamily: Fonts.rounded, fontWeight: '900', fontSize: 24, marginTop: 7 },
  cardDate: { color: '#9CB7A1', fontFamily: Fonts.mono, fontSize: 11, marginTop: 7 },
  primaryButton: { minHeight: 56, borderRadius: 14, backgroundColor: '#7CFD4D', justifyContent: 'center', alignItems: 'center', marginTop: 14 },
  primaryText: { color: '#071108', fontFamily: Fonts.sans, fontWeight: '900', fontSize: 16 },
  completedCard: { marginTop: 14, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.13)', backgroundColor: 'rgba(255,255,255,0.06)', padding: 18 },
  completedLabel: { color: '#7CFD4D', fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1.4 },
  completedScore: { color: '#F3FFF6', fontFamily: Fonts.rounded, fontSize: 32, fontWeight: '900', marginTop: 8 },
  completedMeta: { color: '#9CB7A1', fontFamily: Fonts.sans, marginTop: 4 },
  errorBox: { borderRadius: 13, borderWidth: 1, borderColor: 'rgba(248,113,113,0.5)', backgroundColor: 'rgba(248,113,113,0.12)', padding: 15 },
  errorText: { color: '#FCA5A5', fontFamily: Fonts.sans },
  retryText: { color: '#7CFD4D', fontFamily: Fonts.sans, fontWeight: '900', marginTop: 10 },
});
