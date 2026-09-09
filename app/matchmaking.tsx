import AntDesign from '@expo/vector-icons/AntDesign';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Fonts } from '@/constants/theme';
import { CATEGORY_PACKS, type CategoryPackId } from '@/features/game/category-packs';
import { joinPublicMatchmaking } from '@/features/rooms/room-service';

type MatchmakingPack = Exclude<CategoryPackId, 'custom'>;

export default function MatchmakingScreen() {
  const insets = useSafeAreaInsets();
  const [pack, setPack] = useState<MatchmakingPack>('classic');
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const findMatch = async () => {
    setSearching(true);
    setError(null);
    try {
      const room = await joinPublicMatchmaking(pack);
      router.replace({ pathname: '/lobby', params: { roomId: room.roomId, source: 'matchmaking' } });
    } catch (matchError) {
      setError(matchError instanceof Error ? matchError.message : 'Quick Match is unavailable.');
      setSearching(false);
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 12 }]}>
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.backButton}><AntDesign name="arrow-left" size={20} color="#CFE7D4" /><Text style={styles.backText}>Back</Text></Pressable>
      <View style={styles.content}>
        <Text style={styles.icon}>◎</Text>
        <Text style={styles.kicker}>QUICK MATCH</Text>
        <Text style={styles.title}>Find players.{"\n"}Start battling.</Text>
        <Text style={styles.subtitle}>Choose a category pack. We’ll place you in an open public room or create one for the next player.</Text>
        <View style={styles.options}>
          {CATEGORY_PACKS.map((item) => <Pressable accessibilityRole="button" testID={`matchmaking-pack-${item.id}`} key={item.id} disabled={searching} onPress={() => setPack(item.id)} style={[styles.option, pack === item.id && styles.optionActive]}><Text style={[styles.optionTitle, pack === item.id && styles.optionTitleActive]}>{item.name}</Text><Text style={styles.optionDetail}>{item.description}</Text></Pressable>)}
        </View>
        {error && <View accessibilityRole="alert" style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>}
        <Pressable testID="find-match" accessibilityRole="button" disabled={searching} onPress={() => void findMatch()} style={[styles.primaryButton, searching && styles.disabled]}>{searching ? <><ActivityIndicator color="#071108" /><Text style={styles.primaryText}>Finding your room…</Text></> : <Text style={styles.primaryText}>Find a match</Text>}</Pressable>
        <Text style={styles.hint}>Public games use 3 rounds, 60 seconds each, and support up to 4 players.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0A120A', paddingHorizontal: 24 },
  backButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 7 },
  backText: { color: '#CFE7D4', fontFamily: Fonts.sans, fontWeight: '700' },
  content: { width: '100%', maxWidth: 520, alignSelf: 'center', flex: 1, justifyContent: 'center', paddingBottom: 36 },
  icon: { color: '#7CFD4D', fontSize: 52, marginBottom: 12 },
  kicker: { color: '#7CFD4D', fontFamily: Fonts.mono, fontSize: 11, letterSpacing: 2.1, marginBottom: 8 },
  title: { color: '#F3FFF6', fontFamily: Fonts.rounded, fontSize: 38, lineHeight: 44, fontWeight: '900' },
  subtitle: { color: '#CFE7D4', fontFamily: Fonts.sans, fontSize: 15, lineHeight: 22, marginTop: 10, marginBottom: 22 },
  options: { gap: 9 },
  option: { borderRadius: 13, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', backgroundColor: 'rgba(255,255,255,0.05)', padding: 13 },
  optionActive: { borderColor: '#7CFD4D', backgroundColor: 'rgba(124,253,77,0.12)' },
  optionTitle: { color: '#E6F3E8', fontFamily: Fonts.sans, fontWeight: '800', fontSize: 15 },
  optionTitleActive: { color: '#7CFD4D' },
  optionDetail: { color: '#9CB7A1', fontFamily: Fonts.sans, fontSize: 11, marginTop: 3 },
  primaryButton: { minHeight: 56, borderRadius: 14, backgroundColor: '#7CFD4D', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10, marginTop: 16 },
  primaryText: { color: '#071108', fontFamily: Fonts.sans, fontWeight: '900', fontSize: 16 },
  hint: { color: '#78917D', fontFamily: Fonts.sans, fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 12 },
  errorBox: { borderRadius: 12, borderWidth: 1, borderColor: 'rgba(248,113,113,0.5)', backgroundColor: 'rgba(248,113,113,0.12)', padding: 12, marginTop: 12 },
  errorText: { color: '#FCA5A5', fontFamily: Fonts.sans },
  disabled: { opacity: 0.6 },
});
